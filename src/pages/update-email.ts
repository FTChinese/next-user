import { Account } from "../models/account";
import { FormPage } from "./base-page";
import { ValidationError } from "@hapi/joi";
import { emailSchema, joiOptions, reduceJoiErrors, textLen } from "./validator";
import { accountService } from "../repository/account";
import { APIError } from "../models/api-response";
import { Flash } from "../widget/flash";
import { Form } from "../widget/form";
import { FormControl } from "../widget/form-control";
import { ControlType } from "../widget/widget";
import { TextInputElement } from "../widget/text-input";
import { Button } from "../widget/button";
import { EmailForm } from "../models/form-data";

export class UpdateEmailBuilder {
  flashMsg?: string;
  errors: Map<string, string> = new Map();
  account: Account;
  formData?: EmailForm;

  constructor (account: Account) {
    this.account = account;
  }

  get updatedAccount(): Account {
    return this.formData
        ? Object.assign(this.account, this.formData)
        : this.account;
  }
  async validate(data: EmailForm): Promise<boolean> {
    try {
      const result = await emailSchema.validateAsync(data, joiOptions);

      this.formData = result;
      return true;
    } catch (e) {
      this.errors = reduceJoiErrors(e as ValidationError);

      return false;
    }
  }

  async update(): Promise<boolean> {
    if (!this.formData) {
      throw new Error("invalid form data to change email");
    }

    // noop if email is not actually changed.
    if (this.formData.email === this.account.email) {
      return true;
    }

    try {
      const ok = await accountService.updateEmail(
        this.account.id,
        this.formData,
      );

      return ok;
    } catch (e) {

      const errResp = new APIError(e);

      if (errResp.unprocessable) {
        // error.field: "email"
        // error.code: "missing_field" | "invalid"
        this.errors = errResp.controlErrs;

        return false;
      }

      this.flashMsg = errResp.message;
      return false;
    }
  }

  build(): FormPage {
    const page: FormPage = {
      pageTitle: "更新邮箱",
      heading: "更改登录邮箱",
    }

    if (this.flashMsg) {
      page.flash = Flash.danger(this.flashMsg);
    }

    const email = this.formData 
      ? this.formData.email 
      : this.account.email;

    page.form = new Form({
      disabled: false,
      method: "post",
      action: "",
      controls: [
        new FormControl({
          controlType: ControlType.Text,
          field: new TextInputElement({
            id: "email",
            type: "text",
            name: "email",
            value: email,
            maxlength: textLen.email.max,
          }),
          error: this.errors.get("email"),
        })
      ],
      submitBtn: Button.primary()
        .setName("保存")
        .setDisableWith("正在保存..."),
    });

    return page;
  }
}
