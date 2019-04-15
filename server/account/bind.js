const Router = require('koa-router');
const Joi = require("@hapi/joi");
const debug = require("debug")('user:binding');
const render = require('../../util/render');
const {
  sitemap
} = require("../../lib/sitemap");
const {
  errMessage,
  buildApiError,
  ClientError,
} = require("../../lib/response");

const Credentials = require("../../lib/credentials");
const Account = require("../../lib/account");
const FtcUser = require("../../lib/ftc-user");
const {
  WxUser,
} = require("../../lib/wxlogin");
const {
  isProduction,
} = require("../../lib/config");
const {
  clientApp,
} = require("../middleware");
const {
  joiOptions,
  transformJoiErr,
  loginSchema,
  signUpSchema,
} = require("../schema");

const router = new Router();

/**
 * @description Ask user to enter the email to bind to wechat.
 * /account/bind/email
 */
router.get("/email", async (ctx, next) => {
  ctx.body = await render("account/email-exists.html", ctx.state);
});

/**
 * @description Check if email exists.
 * /account/bind/email
 */
router.post("/email", async(ctx, next) => {

  const email = ctx.request.body.email;
  const { error, value } = Joi.validate(
    { email }, 
    Joi.object().keys({
      email: Joi.string().trim().email().required(), 
    }),
    joiOptions
  );

  if (error) {
    debug("Validation error: %O", error);
    ctx.state.errors = transformJoiErr(error.details);
    ctx.state.email = email;
    ctx.body = await render("account/email-exists.html", ctx.state);
    return
  }

  debug("Validation result: %O", value);

  const credentials = new Credentials({
    email: value.email,
  });

  const exists = await credentials.emailExists();

  ctx.session.email = value.email;

  // If email already exists, redirect to login
  if (exists) {
    ctx.redirect(sitemap.bindLogin);
    return;
  }

  // If email does not exist, redirect to signup.
  ctx.redirect(sitemap.bindSignUp);
});

/**
 * @description Ask user to enter password to log in.
 * /account/bind/login
 */
router.get("/login", async(ctx, next) => {
  // Retrieve the email previsouly same in session.
  const email = ctx.session.email;
  
  // If email does not exist, the session is expired.
  if (!email) {
    ctx.status = 404;
    return;
  }

  // Show the email user previously entered.
  ctx.state.credentials = {
    email,
  }

  ctx.body = await render("account/login.html", ctx.state);

  // Delete the session data for email in production
  // so that it could only be used once, which means
  // refreshing is not allowed.
  if (isProduction) {
    delete ctx.session.email;
  }
});

/**
 * @description If email exists, let user login.
 * After logged in, compare ftc account and wechat account, and then perform mergind accordingly.
 * /account/bind/login
 */
router.post("/login",
  // This is used to record login history.
  clientApp(),

  async(ctx, next) => {
    /**
     * @type {ICredentials}
     */
    const input = ctx.request.body.credentials;

    const { value, error } = Joi.validate(
      input,
      loginSchema,
      joiOptions,
    );

    if (error) {
      ctx.state.errors = transformJoiErr(error.details);
      ctx.state.credentials = input;
      
      return await next();
    }

    try {
      const credentials = new Credentials(value);

      const ftcId = await credentials.authenticate(ctx.state.clientApp);
  
      ctx.session.uid = ftcId;
  
      ctx.redirect(sitemap.bindMerge);
    } catch (e) {
      ctx.state.credentials = input;

      const clientErr = new ClientError(e);

      if (!clientErr.isFromAPI()) {
        ctx.state.errors = clientErr.buildGenericError();

        return await next();
      }

      switch (e.status) {
        case 404:
        case 403:
          ctx.state.errors = {
            credentials: errMessage.credentials_invalid,
          };
          break;

        default:
          ctx.state.errors = buildApiError();
          break;
      }

      debug("Errors: %O", ctx.state.errors);

      return await next();
    }
  },

  async (ctx) => {
    ctx.body = await render("account/login.html", ctx.state);
  }
);

/**
 * @description Show user the accounts to be merged.
 * /account/bind/merge
 */
router.get("/merge", async(ctx, next) => {

  const userId = ctx.session.uid;

  /**
   * @type {Account}
   */
  const account = ctx.state.user;
  /**
   * @type {Account}
   */
  let wxAccount;
  /**
   * @type {Account}
   */
  let ftcAccount;

  switch (account.loginMethod) {
    case "email":
      const wxAcntData = await new WxUser(userId)
        .fetchAccount();
      wxAccount = new Account(wxAcntData);
      ftcAccount = account;
      break;

    case "wechat":
      wxAccount = account;
      const ftcAcntData = await new FtcUser(userId)
        .fetchAccount();
      ftcAccount = new Account(ftcAcntData);
      break;
  }
  

  let denyMerge = "";

  if (ftcAccount.isEqual(wxAccount)) {
    denyMerge = `两个账号已经绑定，无需操作。如果您未看到绑定后的账号信息，请点击"账号安全"刷新。`
  }

  if (ftcAccount.isCoupled()) {
    denyMerge = `账号 ${ftcAccount.email} 已经绑定了其他微信账号。一个FT中文网账号只能绑定一个微信账号。`
  }

  if (wxAccount.isCoupled()) {
    denyMerge = `微信账号 ${wxAccount.wechat.nickname} 已经绑定了其他FT中文网账号。一个FT中文网账号只能绑定一个微信账号。`
  }

  if (!ftcAccount.member.isExpired() && !wxAccount.member.isExpired()) {
    denyMerge = `您的微信账号和FT中文网的账号均购买了会员服务，两个会员均未到期。合并账号会删除其中一个账号的会员信息。为保障您的权益，暂不支持绑定两个会员未过期的账号。您可以寻求客服帮助。`
  }

  ctx.state.wxAccount = wxAccount;
  ctx.state.ftcAccount = ftcAccount;
  if (denyMerge) {
    ctx.state.denyMerge = denyMerge;
  }

  ctx.body = await render("account/merge.html", ctx.state);

  if (isProduction) {
    delete ctx.session.uid;
  }
});

/**
 * @description Perform accounts merging.
 * ftcId
 * wxId
 * /account/bind/merge
 */
router.post("/merge", async(ctx, next) => {
  const userId = ctx.request.body.userId;

  if (!userId) {
    ctx.status = 404;
    return;
  }

  /**
   * @type {Account}
   */
  const account = ctx.state.user;

  /**
   * @type {boolean}
   */
  let done;
  switch (account.loginMethod) {
    case "email":
      done = await new WxUser(userId).merge(account.id)
      break;

    case "wechat":
      // If user logged in via wechat, then the target userId must be FTC id.
      done = await new WxUser(account.unionId).merge(userId)
      break;
  }

  if (done) {
    ctx.redirect(sitemap.account);
    return;
  }

  throw new Error("Unknown error. Please try later.");
});

/**
 * @description Ask user to enter password to create account.
 * /account/bind/signup
 */
router.get("/signup", async(ctx, next) => {
  const email = ctx.session.email;
  if (!email) {
    ctx.status = 404;
    return;
  }

  ctx.state.credentials = {
    email,
  }

  ctx.body = await render("account/signup.html", ctx.state);

  if (isProduction) {
    delete ctx.session.email;
  }
});

/**
 * @description If email does not exist, let user sign up.
 * After signed up, the email is automatically bound to current wechat account.
 */
router.post("/signup", 

  clientApp(),

  async(ctx, next) => {
/**
     * @type {ICredentials}
     */
    const input = ctx.request.body.credentials;

    const { value, error } = Joi.validate(
      input,
      signUpSchema,
      joiOptions,
    );

    if (error) {
      ctx.state.errors = transformJoiErr(error.details);
      ctx.state.credentials = input;
      return await next();
    }

    try {

      const wxUser = new WxUser(ctx.session.user.unionId);

      const ftcId = await wxUser.signUp(value, ctx.state.clientApp);
  
      debug("Wx singup: %s", ftcId);
  
      ctx.redirect(sitemap.account);
    } catch (e) {
      ctx.state.credentials = input;

      const clientErr = new ClientError(e);

      if (!clientErr.isFromAPI()) {
        ctx.state.errors = clientErr.buildGenericError();

        return await next();
      }

      ctx.state.errors = clientErr.buildAPIError();

      return await next();
    }
  },

  async(ctx) => {
    ctx.body = await render("account/signup.html", ctx.state);
  }
);

module.exports = router.routes();