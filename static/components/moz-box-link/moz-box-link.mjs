/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { MozBoxBase } from "../../dependencies/lit-utils.mjs";
import { html, css } from "../../dependencies/lit.all.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* A link with a box-like shape that allows for custom title and description.
*
* @tagname moz-box-link
* @property {string} label - Label for the button.
* @property {string} description - Descriptive text for the button.
* @property {string} iconSrc - The src for an optional icon.
* @property {string} href - The href of the link.
* @property {string} supportPage - Whether or not the link is to a support page.
*/
export default class MozBoxLink extends MozBoxBase {
  static shadowRootOptions = {
    ...super.shadowRootOptions,
    delegatesFocus: true
  };
  static properties = {
    href: { type: String },
    supportPage: {
      type: String,
      attribute: "support-page"
    }
  };
  constructor() {
    super();
    this.href = "";
    this.supportPage = "";
  }
  stylesTemplate() {
    const styles = super.stylesTemplate();
    return html`${styles}`;
  }
  navIconTemplate() {
    return html`<acorn-icon
      class="icon nav-icon"
      src="${new URL("../../assets/open-in-new.svg", import.meta.url).href}"
      role="presentation"></acorn-icon>`;
  }
  render() {
    const template = html`${this.textTemplate()}${this.navIconTemplate()}`;
    const { supportPage } = this;
    return html`
      ${this.stylesTemplate()}
      ${supportPage ? html`<a
            class="button"
            is="moz-support-link"
            support-page=${supportPage}
            data-l10n-id="moz-box-link-anchor" title="Opens in a new tab"
          >
            ${template}
          </a>` : html`<a
            class="button"
            href=${this.href}
            target="_blank"
            data-l10n-id="moz-box-link-anchor" title="Opens in a new tab"
          >
            ${template}
          </a>`}
    `;
  }
  static styles = [...MozBoxBase.styles ?? [], css`/* From chrome://global/content/elements/moz-box-link.css */
a {
  text-decoration: initial;
}

`];
}
if (!customElements.get("moz-box-link")) { customElements.define("moz-box-link", MozBoxLink); }
