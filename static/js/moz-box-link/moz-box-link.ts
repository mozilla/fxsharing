/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { MozBoxBase } from "lit-utils";
import mozBoxLinkCss from "./moz-box-link.css";
import externalLinkIcon from "assets/icons/external-link-16.svg";

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
@customElement("moz-box-link")
export default class MozBoxLink extends MozBoxBase {
  static override shadowRootOptions = {
    ...MozBoxBase.shadowRootOptions,
    delegatesFocus: true,
  };

  @property({ type: String })
  href = "";

  @property({ type: String, attribute: "support-page" })
  supportPage = "";

  navIconTemplate() {
    return html`<div
      class="icon nav-icon contextual-icon"
      style=${styleMap({ "--icon-url": `url("${externalLinkIcon}")` })}
      role="presentation"
    ></div>`;
  }

  render() {
    const template = html`${this.textTemplate()}${this.navIconTemplate()}`;
    const { supportPage } = this;

    return html`
      ${supportPage
        ? html`<a
            class="button"
            is="moz-support-link"
            support-page=${supportPage}
            data-l10n-id="moz-box-link-anchor"
          >
            ${template}
          </a>`
        : html`<a
            class="button"
            href=${this.href}
            target="_blank"
            data-l10n-id="moz-box-link-anchor"
          >
            ${template}
          </a>`}
    `;
  }

  static styles = [MozBoxBase.styles, mozBoxLinkCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-box-link": MozBoxLink;
  }
}
