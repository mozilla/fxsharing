/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
/**
* @tagname moz-breadcrumb
* @property {string} href
* @property {string} label
*/
export class MozBreadcrumb extends MozLitElement {
  static properties = {
    href: { type: String },
    label: {
      type: String,
      fluent: true
    },
    ariaCurrent: {
      attribute: "aria-current",
      type: String
    }
  };
  constructor() {
    super();
    this.label = "";
    this.href = "";
  }
  render() {
    const labelTemplate = this.label || html`<slot></slot>`;
    return html`
      ${this.ariaCurrent ? labelTemplate : html`<a href=${this.href}>${labelTemplate}</a>`}
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-breadcrumb.css */
:host {
  --breadcrumb-link-color: var(--link-color);
  --breadcrumb-link-color-hover: var(--link-color-hover);
  --breadcrumb-link-color-active: var(--link-color-active);
  --breadcrumb-link-color-visited: var(--link-color-visited);
  display: flex;
  align-items: center;
  font-size: var(--font-size-small);
}

a {
  line-height: 100%;
  color: var(--breadcrumb-link-color);
  white-space: nowrap;

  &:visited {
    color: var(--breadcrumb-link-color-visited);
  }

  &:hover {
    color: var(--breadcrumb-link-color-hover);

    &:active {
      color: var(--breadcrumb-link-color-active);
    }
  }
}

`];
}
if (!customElements.get("moz-breadcrumb")) { customElements.define("moz-breadcrumb", MozBreadcrumb); }
/**
* @tagname moz-breadcrumb-group
*/
export class MozBreadcrumbGroup extends MozLitElement {
  /**
  * @type {MutationObserver | void}
  */
  #observer;
  /**
  * Fired when a breadcrumb is either
  * added or removed from the DOM, at which
  * an update is requested to re-render breadcrumbs.
  *
  * @type {MutationCallback}
  */
  #onBreadcrumbMutation(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        this.requestUpdate();
      }
    }
  }
  /**
  * @type {Array<MozBreadcrumb>}
  */
  get breadcrumbs() {
    /**
    * @type {NodeListOf<MozBreadcrumb>}
    */
    const breadcrumbElements = this.querySelectorAll("moz-breadcrumb");
    return Array.from(breadcrumbElements);
  }
  setupBreadcrumbs() {
    const { breadcrumbs } = this;
    return breadcrumbs.map((breadcrumb, i) => {
      breadcrumb.setAttribute("slot", i + "");
      if (i === breadcrumbs.length - 1) {
        breadcrumb.setAttribute("aria-current", "page");
      }
      return breadcrumb;
    });
  }
  update() {
    super.update();
    this.setupBreadcrumbs();
  }
  firstUpdated() {
    if (!this.#observer) {
      this.#observer = new MutationObserver((mutations, observer) => this.#onBreadcrumbMutation(mutations, observer));
      this.#observer.observe(this, { childList: true });
    }
  }
  disconnectedCallback() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = undefined;
    }
    super.disconnectedCallback();
  }
  render() {
    return html`
      <nav data-l10n-id="moz-breadcrumb-group-nav" aria-label="Breadcrumbs">
        <ol>
          ${this.breadcrumbs.map((breadcrumb, i) => {
      return html`<li>
              <slot name=${i}></slot>
            </li>`;
    })}
        </ol>
      </nav>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-breadcrumb-group.css */
:host {
  --breadcrumb-icon-size: var(--icon-size-xsmall);
  --breadcrumb-gap: var(--space-small);
  display: flex;
}

ol {
  list-style: none;
  padding-inline-start: initial;
  margin-block: initial;
  display: flex;
  flex-wrap: wrap;
  gap: var(--breadcrumb-gap);
}

li {
  display: flex;
  align-items: center;
  gap: var(--breadcrumb-gap);

  &:not(:last-child):after {
    content: "";

    -webkit-mask-image: url("../../assets/arrow-right-12.svg");

    mask-image: url("../../assets/arrow-right-12.svg");

    -webkit-mask-size: contain;

    mask-size: contain;

    background-color: currentColor;
display: inline-flex;
    width: auto;
    height: var(--breadcrumb-icon-size);
background-color: currentColor;
  }

  &:dir(rtl):not(:last-child):after {
    content: "";

    -webkit-mask-image: url("../../assets/arrow-left-12.svg");

    mask-image: url("../../assets/arrow-left-12.svg");

    -webkit-mask-size: contain;

    mask-size: contain;

    background-color: currentColor;
}
}

`];
}
if (!customElements.get("moz-breadcrumb-group")) { customElements.define("moz-breadcrumb-group", MozBreadcrumbGroup); }
