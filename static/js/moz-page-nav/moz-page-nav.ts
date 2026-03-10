/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { MozLitElement } from "lit-utils";
import mozPageNavCss from "./moz-page-nav.css";
import mozPageNavButtonCss from "./moz-page-nav-button.css";

import titleUrl from "assets/firefox-enterprise-admin-console-brand.svg";

/**
 * A grouping of navigation buttons that is displayed at the page level,
 * intended to change the selected view, provide a heading, and have links
 * to external resources.
 *
 * @tagname moz-page-nav
 * @property {string} currentView - The currently selected view.
 * @property {string} heading - A heading to be displayed at the top of the navigation.
 * @property {string} [headingUrl] - When present, the heading has a link to this URL
 * @property {string} [secondary-nav-label] - Used as the aria-label of the secondary navigation section
 * @slot [default] - Used to append moz-page-nav-button elements to the navigation.
 * @slot [subheading] - Used to append page specific search input or notification to the nav.
 * @slot [secondary-nav] - Used for the secondary navigation items
 */
export default class MozPageNav extends MozLitElement {
  static properties = {
    currentView: { type: String },
    hasSecondaryNav: { type: Boolean, state: true, attribute: false },
    headingUrl: { type: String },
    secondaryNavLabel: {
      type: String,
      fluent: true,
      attribute: "secondary-nav-label",
    },
  };

  currentView?: string | null;
  hasSecondaryNav: boolean = false;
  headingUrl?: string;
  secondaryNavLabel?: string;

  static queries = {
    headingEl: "#page-nav-heading",
    primaryNavGroupSlot: ".primary-nav-group slot",
    secondaryNavGroupSlot: "#secondary-nav-group slot",
  };
  declare headingEl: HTMLElement;
  declare primaryNavGroupSlot: HTMLSlotElement;
  declare secondaryNavGroupSlot: HTMLSlotElement;

  get pageNavButtons() {
    return this.getVisibleSlottedChildren(this.primaryNavGroupSlot);
  }

  get secondaryNavButtons() {
    return this.getVisibleSlottedChildren(this.secondaryNavGroupSlot);
  }

  getVisibleSlottedChildren(el: HTMLSlotElement) {
    return el?.assignedElements().filter(
      (element) =>
        element?.localName === "moz-page-nav-button" &&
        // Replace with the native checkVisibility when it's supported enough
        this.checkElementVisibility(element),
    ) as MozPageNavButton[];
  }

  checkElementVisibility(element: Element) {
    const computedStyles = window.getComputedStyle(element);
    return (
      (!(element instanceof HTMLElement) || !element.hidden) &&
      computedStyles.getPropertyValue("display") !== "none" &&
      computedStyles.getPropertyValue("visibility") !== "hidden" &&
      +computedStyles.getPropertyValue("opacity") > 0
    );
  }

  handleChangeView(e: Event & { target: MozPageNavButton }) {
    this.currentView = e.target.view;
  }

  handleFocus(e: KeyboardEvent) {
    if (e.key == "ArrowDown" || e.key == "ArrowRight") {
      e.preventDefault();
      this.focusNextView();
    } else if (e.key == "ArrowUp" || e.key == "ArrowLeft") {
      e.preventDefault();
      this.focusPreviousView();
    }
  }

  focusPreviousView() {
    const pageNavButtons = this.pageNavButtons;
    const currentIndex = pageNavButtons.findIndex((b) => b.selected);
    const prev = pageNavButtons[currentIndex - 1];
    if (prev) {
      prev.activate();
      prev.focus();
    }
  }

  focusNextView() {
    const pageNavButtons = this.pageNavButtons;
    const currentIndex = pageNavButtons.findIndex((b) => b.selected);
    const next = pageNavButtons[currentIndex + 1];
    if (next) {
      next.activate();
      next.focus();
    }
  }

  handleFirstNavChange() {
    this.updateNavButtonsState();
  }

  handleSecondaryNavChange(event: Event & { target: HTMLSlotElement }) {
    const secondaryNavElements = event.target.assignedElements();
    this.hasSecondaryNav = !!secondaryNavElements.length;
  }

  updated() {
    this.updateNavButtonsState();
  }

  async updateNavButtonsState() {
    let isViewSelected = false;
    const assignedPageNavButtons = this.pageNavButtons;
    for (const button of assignedPageNavButtons) {
      button.selected = button.view == this.currentView;
      isViewSelected = isViewSelected || button.selected;
    }
    if (!isViewSelected && assignedPageNavButtons.length) {
      // Current page nav has no matching view, reset to the first view.
      assignedPageNavButtons[0].activate();
    }
  }

  headingTemplate() {
    // The title's alt isn't localized because this is more of a brand.
    return html` <div class="page-nav-heading-wrapper">
      <div class="logo"></div>
      <div class="page-nav-heading heading-large" id="page-nav-heading">
        <img src=${titleUrl} alt="Admin Console" />
      </div>
    </div>`;
  }

  render() {
    return html`
      <nav>
        ${this.headingUrl
          ? html`<a
              href=${this.headingUrl}
              data-l10n-id="back-to-home-link"
              view=""
              @click=${this.handleChangeView}
              >${this.headingTemplate()}</a
            >`
          : this.headingTemplate()}
        <slot name="subheading"></slot>
        <div
          class="primary-nav-group"
          role="tablist"
          aria-orientation="vertical"
          aria-labelledby="page-nav-heading"
        >
          <slot
            @change-view=${this.handleChangeView}
            @keydown=${this.handleFocus}
            @slotchange=${this.handleFirstNavChange}
          ></slot>
        </div>
        <section
          id="secondary-nav-group"
          aria-label=${ifDefined(this.secondaryNavLabel)}
        >
          <slot
            name="secondary-nav"
            @slotchange=${this.handleSecondaryNavChange}
          ></slot>
        </section>
      </nav>
    `;
  }

  static styles = [MozLitElement.styles, mozPageNavCss];
}
customElements.define("moz-page-nav", MozPageNav);

/**
 * A navigation button intended to change the selected view within a page.
 *
 * @tagname moz-page-nav-button
 * @property {string} href - (optional) The url for an external link if not a support page URL
 * @property {string} target - (optional) The target if the href property is present.
 * @property {string} iconSrc - The chrome:// url for the icon used for the button.
 * @property {boolean} selected - Whether or not the button is currently selected.
 * @property {string} supportPage - (optional) The short name for the support page a secondary link should launch to
 * @slot [default] - Used to append the l10n string to the button.
 */
export class MozPageNavButton extends MozLitElement {
  static properties = {
    iconSrc: { type: String },
    href: { type: String },
    target: { type: String, reflect: true },
    selected: { type: Boolean },
    label: { type: String, fluent: true },
  };

  iconSrc?: string;
  href?: string;
  target?: string;
  selected?: boolean;
  label!: string;

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute("role", "none");
  }

  static queries = {
    buttonEl: "button, a",
  };
  declare buttonEl: HTMLButtonElement;

  get view() {
    return this.getAttribute("view");
  }

  activate() {
    this.dispatchEvent(
      new CustomEvent("change-view", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  focus() {
    this.buttonEl.focus();
  }

  itemTemplate() {
    if (this.href) {
      return this.linkTemplate(this.href);
    }
    return this.buttonTemplate();
  }

  buttonTemplate() {
    if (this.slot) {
      return html`
        <button aria-label=${this.label}>${this.innerContentTemplate()}</button>
      `;
    }
    return html`
      <button
        aria-selected=${this.selected}
        aria-label=${this.label}
        tabindex=${this.selected ? 0 : -1}
        role="tab"
        @click=${this.activate}
      >
        ${this.innerContentTemplate()}
      </button>
    `;
  }

  linkTemplate(href: string) {
    const isExternal =
      href.startsWith("http://") || href.startsWith("https://");

    if (isExternal || this.slot) {
      // If this isn't in the first navigation slot, it shouldn't participate to the focus handling.
      // External links neither.
      return html`
        <a
          href=${href}
          target=${ifDefined(isExternal ? "_blank" : this.target)}
          router-ignore
          aria-label=${this.label}
          class="moz-page-nav-link"
        >
          ${this.innerContentTemplate()}
        </a>
      `;
    }

    return html`
      <a
        href=${href}
        target=${ifDefined(this.target)}
        aria-label=${this.label}
        role="tab"
        aria-selected=${this.selected}
        tabindex=${this.selected ? 0 : -1}
        class="moz-page-nav-link"
        @click=${this.activate}
      >
        ${this.innerContentTemplate()}
      </a>
    `;
  }

  innerContentTemplate() {
    return html`
      ${this.iconSrc
        ? html`<div
            class="page-nav-icon contextual-icon"
            style=${styleMap({ "--icon-url": `url("${this.iconSrc}")` })}
            role="presentation"
          ></div>`
        : ""}
      <span class="inner-label" role="presentation">${this.label}</span>
    `;
  }

  render() {
    return html`${this.itemTemplate()}`;
  }

  static styles = [MozLitElement.styles, mozPageNavButtonCss];
}
customElements.define("moz-page-nav-button", MozPageNavButton);
