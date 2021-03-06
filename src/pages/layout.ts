import { Account, isAccountFtcOnly } from "../models/account";
import { viper } from "../config/viper";
import { buildSidebar, SidebarItem } from "../widget/sidebar";
import { FooterSection, footer } from "../widget/footer";
import { accountMap, androidMap, entranceMap } from "../config/sitemap";
import { Link } from "../widget/link";
const pkg = require("../../package.json");

const bsVersion = pkg.devDependencies.bootstrap.replace("^", "");
const bsNativeVersion = pkg.devDependencies["bootstrap.native"].replace("^", "");

const iconUrl = "http://interactive.ftchinese.com/favicons";
export interface Layout {
  iconBaseUrl: string;
  subBrand: Link;
  pageTitle: string;
  env: {
    iconDimens: number[];
    iconBaseUrl: string;
    bsVersion: string;
    bsNativeVersion: string;
    isProduction: boolean,
    footer: FooterSection[];
    copyright: string;
    appVersion: string;
  };
  requestVerificationPath?: string;
  sideNav: SidebarItem[];
}

export class LayoutBuilder {
  private title = '我的FT';
  private copyright = `© FT中文网 ${new Date().getFullYear()}.`;
  private reqPath?: string;
  private account?: Account;
  private subBrand: Link = {
    text: '我的FT',
    href: entranceMap.login,
  }

  // Override default title.
  setTitle(t: string): LayoutBuilder {
    this.title = t;
    return this;
  }

  /**
   * @description Used to decide which navigation item should be highlighted. Used only after logged-in.
   * @param p - current request path.
   */
  setPath(p: string): LayoutBuilder {
    this.reqPath = p;
    return this;
  }

  // Determine whether we should show the box to urge
  // user to verify email address.
  setAccount(a: Account): LayoutBuilder {
    this.account = a;
    return this;
  }
  
  setSubBrand(l: Link): LayoutBuilder {
    this.subBrand = l;
    return this;
  }

  build(): Layout {
    return {
      iconBaseUrl: iconUrl,
      subBrand: this.subBrand,
      pageTitle: this.title,
      env: {
        iconDimens: [180, 152, 120, 76],
        iconBaseUrl: iconUrl,
        bsVersion: bsVersion,
        bsNativeVersion: bsNativeVersion,
        isProduction: viper.isProduction,
        footer,
        copyright: this.copyright,
        appVersion: pkg.version,
      },
      requestVerificationPath: this.account && isAccountFtcOnly(this.account) && !this.account.isVerified
        ? accountMap.requestVerification
        : undefined,
      sideNav: this.reqPath
        ? buildSidebar(this.reqPath, this.account)
        : [],
    }
  }

  static base(): LayoutBuilder {
    return new LayoutBuilder();
  }

  static content(account: Account, currentPath: string): LayoutBuilder {
    return new LayoutBuilder()
      .setAccount(account)
      .setPath(currentPath);
  }

  static android(): LayoutBuilder {
    return new LayoutBuilder()
      .setSubBrand({
        text: '安卓App',
        href: androidMap.latest
      });
  }
}
