import Router from "koa-router";
import debug from "debug";
import { toDataURL } from "qrcode";
import render from "../util/render";
import {
    appHeader,
} from "./middleware";
import {  
    Account,
} from "../models/reader";
import {
    Tier,
    Cycle,
    PaymentMethod,
} from "../models/enums";
import {
    subViewModel,
} from "../viewmodels/sub-viewmodel";
import { 
    isProduction,
} from "../config/viper";
import { scheduler } from "../models/paywall";
import { subRepo } from "../repository/subscription";
import { AliOrder } from "../models/order";
import { APIError } from "../viewmodels/api-response";

const log = debug("user:subscription");
const router = new Router();

/**
 * @description Show membership
 * /user/subscription
 */
router.get("/", async(ctx, next) => {
    const account: Account = ctx.state.user;

    const { success, errResp} = await subViewModel.refresh(account);

    if (errResp) {
        const uiData = subViewModel.buildErrorUI(errResp);

        Object.assign(ctx.state, uiData);

        ctx.body = await render("layouts/two-cols.html", ctx.state);
        return;
    }

    if (!success) {
        throw new Error("Unknown error");
    }

    // Update session data.
    ctx.session.user = success;

    // If current user has membership, show membership page.
    if (success.membership.isMember) {

        ctx.state.data = subViewModel.buildMemberUI(success.membership);

        ctx.body = await render("subscription/membership.html", ctx.state);
        return;
    }
    
    // Otherwise show paywall.
    Object.assign(ctx.state, subViewModel.buildPaywallUI(scheduler.paywall));

    ctx.body = await render("subscription/paywall.html", ctx.state);
});

/**
 * @description Renew membership
 * /user/subscription/renew
 */
router.get("/renew", async (ctx, next) => {
    const account: Account = ctx.state.user;

    ctx.body = await render("subscription/pay.html", ctx.state);
});

router.get("/orders", async (ctx, next) => {
    const account: Account = ctx.state.user;

    ctx.body = await render("subscription/orders.html", ctx.state)
});

interface Env {
    sandbox?: "true";
}

router.get("/pay/:tier/:cycle", async (ctx, next) => {
    const tier: Tier = ctx.params.tier;
    const cycle: Cycle = ctx.params.cycle;

    const plan = scheduler.findPlan(tier, cycle);
    const query: Env = ctx.request.query;

    if (!plan) {
        ctx.status = 404;
        return;
    }

    Object.assign(ctx.state, subViewModel.buildPaymentUI(plan, query.sandbox == "true"));

    ctx.body = await render("subscription/pay.html", ctx.state);
});

/**
 * @description Start payment process.
 * `ctx.session.order: OrderBase` is added for verification after callback.
 */
router.post("/pay/:tier/:cycle", appHeader(), async (ctx, next) => {
    const tier: Tier = ctx.params.tier;
    const cycle: Cycle = ctx.params.cycle;

    const plan = scheduler.findPlan(tier, cycle);
    if (!plan) {
        ctx.status = 404;
        return;
    }

    const query: Env = ctx.request.query;
    const sandbox: boolean = query.sandbox == "true";

    const payMethod: PaymentMethod | undefined = ctx.request.body.payMethod;

    const formState = subViewModel.validatePayMethod(payMethod);
    if (!formState.value) {
        Object.assign(
            ctx.state, 
            subViewModel.buildPaymentUI(
                plan, 
                sandbox, 
                { formState, },
            )
        );

        return await next();
    }

    const isMobile = subViewModel.isMobile(ctx.header["user-agent"]);

    const account: Account = ctx.state.user;

    try {
        switch (payMethod) {
            case "alipay":
                let aliOrder: AliOrder;
                if (isMobile) {
                    aliOrder = await subRepo.aliMobilePay(
                        account,
                        plan,
                        ctx.state.appHeaders,
                    );

                    
                } else {
                    aliOrder = await subRepo.aliDesktopPay(
                        account,
                        plan,
                        ctx.state.appHeaders,
                    );
                }
                ctx.redirect(aliOrder.redirectUrl);
                ctx.session.order = aliOrder;
                return;

            case "wechat":
                const wxOrder = await subRepo.wxDesktopPay(
                    account,
                    plan,
                    ctx.state.appHeaders,
                );

                log("Wechat order: %O", wxOrder);

                const dataUrl = await toDataURL(wxOrder.qrCodeUrl);
                
                Object.assign(
                    ctx.state, 
                    subViewModel.buildPaymentUI(
                        plan,
                        sandbox,
                        {
                            qrData: dataUrl,
                        },
                    )
                );

                return await next();
        }
    } catch (e) {
        ctx.state.errors = {
            message: e.message,
        };

        Object.assign(
            ctx.state,
            subViewModel.buildPaymentUI(
                plan,
                sandbox,
                {
                    formState,
                    errResp: new APIError(e),
                }
            )
        );

        return await next();
    }
}, async (ctx, next) => {
    ctx.body = await render("subscription/pay.html", ctx.state);
});

/**
 * @description Show alipay result.
 * The result is parsed from url query paramters.
 * GET /subscription/done/ali
 */
router.get("/done/ali", async (ctx, next) => {
    ctx.body = await render("subscription/alipay-done.html", ctx.state);

    // For development, keep session to test ui.
    if (isProduction) {
      delete ctx.session.subs;
    }
});

router.get("/done/wx", async (ctx, next) => {

}, async (ctx) => {
    ctx.body = await render("subscription/wxpay-done.html", ctx.state);

    if (isProduction) {
        delete ctx.session.subs;
    }
});

export default router.routes();
