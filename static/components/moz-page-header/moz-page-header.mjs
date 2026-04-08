/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* A header component for providing context about a specific page.
*
* @tagname moz-page-header
* @property {string} heading - The page title text.
* @property {string} description - Secondary text shown under the heading.
* @property {string} iconSrc - The src for an optional icon.
* @property {string} supportPage - Optional URL for a related support article.
* @property {boolean} backButton - Whether or not the header should include a back button.
* @slot breadcrumbs - Container for a <moz-breadcrumb-group, shown above the heading.
* @fires navigate-back
*  Event indicating the backwards navigation should occur.
*/
export default class MozPageHeader extends MozLitElement {
  static properties = {
    heading: {
      type: String,
      fluent: true
    },
    description: {
      type: String,
      fluent: true
    },
    iconSrc: { type: String },
    supportPage: {
      type: String,
      attribute: "support-page"
    },
    backButton: { type: Boolean }
  };
  static queries = {
    headingEl: "h1",
    backButtonEl: "moz-button"
  };
  constructor() {
    super();
    this.heading = "";
    this.description = "";
    this.iconSrc = "";
    this.supportPage = "";
    this.backButton = false;
  }
  backButtonTemplate() {
    if (!this.backButton) {
      return "";
    }
    return html`<moz-button
      type="ghost"
      data-l10n-id="back-nav-button-title" title="Go back"
      iconsrc="${new URL("../../assets/arrow-left.svg", import.meta.url).href}"
      class="back-button"
      @click=${this.handleBack}
    ></moz-button>`;
  }
  iconTemplate() {
    if (!this.iconSrc) {
      return "";
    }
    return html`<acorn-icon src=${this.iconSrc} role="presentation" class="icon"></acorn-icon>`;
  }
  descriptionTemplate() {
    if (!this.description) {
      return "";
    }
    return html`<span class="description" id="description">
        ${this.description}
      </span>
      ${this.supportLinkTemplate()}`;
  }
  supportLinkTemplate() {
    if (!this.supportPage) {
      return "";
    }
    return html`<a
      is="moz-support-link"
      support-page=${this.supportPage}
      part="support-link"
      class="support-link"
      aria-describedby=${this.description ? "description" : "heading"}
    ></a>`;
  }
  handleBack() {
    this.dispatchEvent(new Event("navigate-back"));
  }
  render() {
    return html`
      <div class="page-header-container">
        <slot name="breadcrumbs"></slot>
        <div class="heading">
          ${this.backButtonTemplate()}${this.iconTemplate()}
          <h1 id="heading">${this.heading}</h1>
          ${!this.description ? this.supportLinkTemplate() : ""}
        </div>
        ${this.descriptionTemplate()}
      </div>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-page-header.css */
::slotted(moz-breadcrumb-group) {
  margin-block-end: var(--space-large);
}

.heading {
  display: flex;
  align-items: center;
  gap: var(--space-small);
  min-height: var(--button-min-height);
}

.back-button:dir(rtl) {
  transform: scaleX(-1);
}

h1 {
  margin: 0;
}

.icon {
  width: var(--icon-size);
  height: var(--icon-size);
color: currentColor;
}

.description {
  color: var(--text-color-deemphasized);

  &:has( + .support-link) {
    margin-inline-end: var(--space-xxsmall);
  }
}

.support-link {
  display: inline-block;
}

`];
}
if (!customElements.get("moz-page-header")) { customElements.define("moz-page-header", MozPageHeader); }
