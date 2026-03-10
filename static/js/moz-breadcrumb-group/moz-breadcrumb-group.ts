/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, type PropertyValues } from "lit";
import { map } from "lit/directives/map.js";
import { MozLitElement } from "lit-utils";

import breadcrumbGroupStyles from "./moz-breadcrumb-group.css";

/**
 * @tagname moz-breadcrumb
 * @property {string} href - The URL to link to
 * @property {string} label - The breadcrumb label
 * @property {string} ariaCurrent - aria-current attribute value
 */
export class MozBreadcrumb extends MozLitElement {
  static properties = {
    href: { type: String },
    label: { type: String, fluent: true },
    ariaCurrent: { attribute: "aria-current", type: String },
  };

  label = "";
  href = "";
  ariaCurrent = "";

  render() {
    const labelTemplate = this.label || html`<slot></slot>`;
    return this.ariaCurrent || !this.href
      ? labelTemplate
      : html`<a href=${this.href}>${labelTemplate}</a>`;
  }

  static styles = [MozLitElement.styles];
}

customElements.define("moz-breadcrumb", MozBreadcrumb);

/**
 * @tagname moz-breadcrumb-group
 */
export default class MozBreadcrumbGroup extends MozLitElement {
  #observer?: MutationObserver;

  /**
   * Fired when a breadcrumb is either
   * added or removed from the DOM, at which
   * an update is requested to re-render breadcrumbs.
   */
  #handleBreadcrumbMutation(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        this.requestUpdate();
      }
    }
  }

  get breadcrumbs() {
    const breadcrumbElements = this.querySelectorAll("moz-breadcrumb");
    return Array.from(breadcrumbElements) as MozBreadcrumb[];
  }

  setupBreadcrumbs() {
    const { breadcrumbs } = this;
    return breadcrumbs.map((breadcrumb, i) => {
      breadcrumb.setAttribute("slot", i.toString());

      if (i === breadcrumbs.length - 1) {
        breadcrumb.setAttribute("aria-current", "page");
      }

      return breadcrumb;
    });
  }

  update(changedProperties: PropertyValues<this>) {
    super.update(changedProperties);
    this.setupBreadcrumbs();
  }

  firstUpdated() {
    if (!this.#observer) {
      this.#observer = new MutationObserver((mutations) =>
        this.#handleBreadcrumbMutation(mutations),
      );
      this.#observer.observe(this, {
        childList: true,
      });
    }
  }

  disconnectedCallback() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = undefined;
    }
    super.disconnectedCallback?.();
  }

  render() {
    return html`
      <nav data-l10n-id="moz-breadcrumb-group-nav">
        <ol>
          ${map(
            this.breadcrumbs,
            (_, i) => html`<li><slot name=${i}></slot></li>`,
          )}
        </ol>
      </nav>
    `;
  }

  static styles = [MozLitElement.styles, breadcrumbGroupStyles];
}

customElements.define("moz-breadcrumb-group", MozBreadcrumbGroup);

declare global {
  interface HTMLElementTagNameMap {
    "moz-breadcrumb": MozBreadcrumb;
    "moz-breadcrumb-group": MozBreadcrumbGroup;
  }
}
