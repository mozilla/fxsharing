/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, when, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "../moz-support-link/moz-support-link.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* @typedef {("mobile"|"default")} PageNavType
* @property {PageNavType} [type] - The type of the component
*/
/**
* A grouping of navigation buttons that is displayed at the page level,
* intended to change the selected view, provide a heading, and have links
* to external resources.
*
* @tagname moz-page-nav
* @property {string} currentView - The currently selected view.
* @property {string} heading - A heading to be displayed at the top of the navigation.
* @property {PageNavType} [type] - The type of the component
* @slot [default] - Used to append moz-page-nav-button elements to the navigation.
* @slot [subheading] - Used to append page specific search input or notification to the nav.
*/
export default class MozPageNav extends MozLitElement {
  static properties = {
    currentView: { type: String },
    heading: {
      type: String,
      fluent: true
    },
    type: {
      type: String,
      reflect: true
    }
  };
  static queries = {
    headingEl: "#page-nav-heading",
    primaryNavGroupSlot: ".primary-nav-group slot",
    secondaryNavGroupSlot: "#secondary-nav-group slot"
  };
  constructor() {
    super();
    /**
    * @type {PageNavType}
    */
    this.type = "default";
  }
  get pageNavButtons() {
    return this.getVisibleSlottedChildren(this.primaryNavGroupSlot);
  }
  get secondaryNavButtons() {
    return this.getVisibleSlottedChildren(this.secondaryNavGroupSlot);
  }
  getVisibleSlottedChildren(el) {
    return el?.assignedElements().filter((element) => element?.localName === "moz-page-nav-button" && this.checkElementVisibility(element));
  }
  checkElementVisibility(element) {
    let computedStyles = window.getComputedStyle(element);
    return !element.hidden && computedStyles.getPropertyValue("display") !== "none" && computedStyles.getPropertyValue("visibility") !== "hidden" && computedStyles.getPropertyValue("opacity") > 0;
  }
  onChangeView(e) {
    this.currentView = e.target.view;
  }
  handleFocus(e) {
    if (e.key == "ArrowDown" || e.key == "ArrowRight") {
      e.preventDefault();
      this.focusNextView();
    } else if (e.key == "ArrowUp" || e.key == "ArrowLeft") {
      e.preventDefault();
      this.focusPreviousView();
    }
  }
  focusPreviousView() {
    let pageNavButtons = this.pageNavButtons;
    let currentIndex = pageNavButtons.findIndex((b) => b.selected);
    let prev = pageNavButtons[currentIndex - 1];
    if (prev) {
      prev.activate();
      prev.buttonEl.focus();
    }
  }
  focusNextView() {
    let pageNavButtons = this.pageNavButtons;
    let currentIndex = pageNavButtons.findIndex((b) => b.selected);
    let next = pageNavButtons[currentIndex + 1];
    if (next) {
      next.activate();
      next.buttonEl.focus();
    }
  }
  onPrimaryNavChange() {
    this.updateNavButtonsState();
  }
  onSecondaryNavChange(event) {
    let secondaryNavElements = event.target.assignedElements();
    this.hasSecondaryNav = !!secondaryNavElements.length;
  }
  updated() {
    this.updateNavButtonsState();
  }
  updateNavButtonsState() {
    let isViewSelected = false;
    let assignedPageNavButtons = this.pageNavButtons;
    for (let button of assignedPageNavButtons) {
      button.selected = button.view == this.currentView;
      isViewSelected = isViewSelected || button.selected;
    }
    if (!isViewSelected && assignedPageNavButtons.length) {
      // Current page nav has no matching view, reset to the first view.
      assignedPageNavButtons[0].activate();
    }
  }
  render() {
    return html`
      <div class="page-nav-heading-wrapper">
        ${this.type === "mobile" ? html`<moz-button
              type="icon ghost"
              aria-label="Open Menu"
              aria-expanded="false"
              iconsrc="${new URL("../../assets/menu.svg", import.meta.url).href}"
            >
            </moz-button>` : ""}
        <div class="logo"></div>
        <h1 class="page-nav-heading" id="page-nav-heading">${this.heading}</h1>
      </div>
      <slot name="subheading"></slot>
      <nav>
        <div
          class="primary-nav-group"
          role="tablist"
          aria-orientation="vertical"
          aria-labelledby="page-nav-heading"
        >
          <slot
            @change-view=${this.onChangeView}
            @keydown=${this.handleFocus}
            @slotchange=${this.onPrimaryNavChange}
          ></slot>
        </div>
        ${when(this.hasSecondaryNav, () => html`<hr />`)}
        <div id="secondary-nav-group" role="group">
          <slot
            name="secondary-nav"
            @slotchange=${this.onSecondaryNavChange}
          ></slot>
        </div>
      </nav>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-page-nav.css */
:host {
  --page-nav-margin-top: 72px;
  --page-nav-gap: var(--space-large);
  --page-nav-button-gap: var(--space-xsmall);
  --page-nav-border-color: var(--border-color-transparent);
  --page-nav-focus-outline-inset: var(--focus-outline-inset);
  --page-nav-heading-logo-size: calc(var(--icon-size)  + var(--space-small));
  --page-nav-hr-color: var(--border-color);
  margin-inline-start: 42px;
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: var(--page-nav-gap);

  @media (prefers-reduced-motion) {
    border-inline-end: 1px solid var(--page-nav-border-color);
    padding-inline-end: var(--space-small);
  }

  @media (width <= 52rem) {
    grid-template-rows: 1fr auto;
  }
}

nav {
  display: flex;
  flex-direction: column;
  gap: var(--page-nav-gap);
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.page-nav-heading-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-small);
  margin-block-start: var(--page-nav-margin-top);

  & > .logo {
    display: inline-block;
    height: var(--page-nav-heading-logo-size);
    width: var(--page-nav-heading-logo-size);
    background: image-set("chrome://branding/content/about-logo.png" 1x, "chrome://branding/content/about-logo@2x.png" 2x) center no-repeat;
    background-size: auto;
    background-size: var(--page-nav-heading-logo-size);
    margin-inline-start: calc(var(--space-medium)  - ((var(--page-nav-heading-logo-size)  - var(--icon-size)) / 2));

    @media (width <= 52rem) {
      margin-inline-start: 4px;
    }
  }

  & > .page-nav-heading {
    font-size: var(--font-size-xlarge);
    font-weight: var(--heading-font-weight);
    margin-block: 0;

    @media (width <= 52rem) {
      display: none;
    }
  }
}

.primary-nav-group, #secondary-nav-group {
  display: grid;
  grid-template-columns: 1fr;
  grid-auto-rows: min-content;
  gap: var(--page-nav-button-gap);

  @media (width <= 52rem) {
    justify-content: center;
  }

  &:not(:has(slot:has-slotted)) {
    display: none;
  }
}

hr {
  width: 100%;
  margin: 0;
  height: 1px;
  border: 0;
  background-color: var(--page-nav-hr-color);
  flex-shrink: 0;
}

:host([type="mobile"]) {
  --page-nav-heading-logo-size: var(--icon-size-xlarge);
  margin-inline-start: var(--page-nav-gap);
  margin-block-start: var(--space-small);
  padding: var(--page-nav-gap);
  box-shadow: var(--box-shadow-level-4);
  height: min-content;

  & .page-nav-heading-wrapper {
    margin-block-start: unset;

    & > .page-nav-heading {
      font-size: var(--font-size-xxlarge);
    }
  }

  & .logo {
    margin-inline-start: unset;
  }

  & nav {
    display: none;
  }
}

`];
}
if (!customElements.get("moz-page-nav")) { customElements.define("moz-page-nav", MozPageNav); }
/**
* A navigation button intended to change the selected view within a page.
*
* @tagname moz-page-nav-button
* @property {string} href - (optional) The url for an external link if not a support page URL
* @property {string} iconSrc - The chrome:// url for the icon used for the button.
* @property {boolean} selected - Whether or not the button is currently selected.
* @property {string} supportPage - (optional) The short name for the support page a secondary link should launch to
* @slot [default] - Used to append the l10n string to the button.
*/
export class MozPageNavButton extends MozLitElement {
  static properties = {
    iconSrc: {
      type: String,
      reflect: true
    },
    href: { type: String },
    selected: { type: Boolean },
    supportPage: {
      type: String,
      attribute: "support-page"
    }
  };
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("role", "none");
  }
  static queries = {
    buttonEl: "button",
    linkEl: "a"
  };
  get view() {
    return this.getAttribute("view");
  }
  activate() {
    this.dispatchEvent(new CustomEvent("change-view", {
      bubbles: true,
      composed: true
    }));
  }
  itemTemplate() {
    if (this.href || this.supportPage) {
      return this.linkTemplate();
    }
    return this.buttonTemplate();
  }
  buttonTemplate() {
    return html`
      <button
        aria-selected=${this.selected}
        tabindex=${this.selected ? 0 : -1}
        role="tab"
        ?selected=${this.selected}
        @click=${this.activate}
      >
        ${this.innerContentTemplate()}
      </button>
    `;
  }
  linkTemplate() {
    if (this.supportPage) {
      return html`
        <a
          is="moz-support-link"
          class="moz-page-nav-link"
          support-page=${this.supportPage}
        >
          ${this.innerContentTemplate()}
        </a>
      `;
    }
    return html`
      <a href=${this.href} class="moz-page-nav-link" target="_blank">
        ${this.innerContentTemplate()}
      </a>
    `;
  }
  innerContentTemplate() {
    return html`
      ${this.iconSrc ? html`<acorn-icon
            class="page-nav-icon"
            src=${this.iconSrc}
            role="presentation"></acorn-icon>` : ""}
      <slot></slot>
    `;
  }
  render() {
    return html`
      ${this.itemTemplate()}
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-page-nav-button.css */
:host {
  --page-nav-button-border-radius: var(--button-border-radius);
  --page-nav-button-text-color: var(--button-text-color-ghost);
  --page-nav-button-text-color-hover: var(--button-text-color-ghost-hover);
  --page-nav-button-text-color-active: var(--button-text-color-ghost-active);
  --page-nav-button-background-color: var(--button-background-color-ghost);
  --page-nav-button-background-color-hover: var(--button-background-color-ghost-hover);
  --page-nav-button-background-color-active: var(--button-background-color-ghost-active);
  --page-nav-button-background-color-selected: color-mix(in srgb, currentColor 8%, transparent);
  --page-nav-button-padding: var(--space-small) var(--space-medium);
  --page-nav-button-border-color-hover: var(--button-border-color-ghost-hover);
  --page-nav-button-border-color-active: var(--button-border-color-ghost-active);
  border-radius: var(--border-radius-small);

  @media (width <= 52rem) {
    --page-nav-button-padding: var(--space-small);
  }
}

:host(:not([hidden])) {
  display: flex;
  flex-direction: column;
}

:host([iconsrc]) {
  @media (width <= 52rem) {
    width: var(--button-size-icon);
  }
}

a[href], button {
  background-color: var(--page-nav-button-background-color);
  transition: background-color .15s;
  border: unset;
display: flex;
  gap: var(--space-medium);
  align-items: center;
  font-family: inherit;
  font-size: inherit;
  font-weight: normal;
  border-radius: var(--page-nav-button-border-radius);
  color: var(--page-nav-button-text-color);
  text-align: start;
  padding: var(--page-nav-button-padding);
  position: relative;

  @media (forced-colors) {
    transition: none;
  }

  @media (prefers-contrast) {
    border: 1px solid var(--page-nav-border-color);
  }
}

a[href] {
  text-decoration: none;
  box-sizing: border-box;
}

a[href]:hover, button:hover:not([selected]) {
  color: var(--page-nav-button-text-color-hover);
  background-color: var(--page-nav-button-background-color-hover);
  border-color: var(--page-nav-button-border-color-hover);

  &:active {
    color: var(--page-nav-button-text-color-active);
    background-color: var(--page-nav-button-background-color-active);
    border-color: var(--page-nav-button-border-color-active);
  }
}

button {
  &:hover {
    cursor: pointer;
  }

  &[selected] {
    color: var(--color-accent-primary);
    background-color: var(--page-nav-button-background-color-selected);
    font-weight: var(--font-weight-semibold);

    @media (prefers-contrast) {
      border-color: var(--border-color-selected);
    }

    &:before {
      background-color: var(--color-accent-primary);
    }
  }

  &:before {
    content: "";
    display: block;
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 4px;
    background-color: #0000;
    border-start-start-radius: var(--page-nav-button-border-radius);
    border-end-start-radius: var(--page-nav-button-border-radius);

    @media (prefers-contrast) {
      border-radius: 0;
    }
  }
}

a[href]:focus-visible, button:focus-visible, button[selected]:focus-visible {
  outline: var(--focus-outline);
  outline-offset: var(--page-nav-focus-outline-inset);
  border-radius: var(--border-radius-small);
}

.page-nav-icon {
  height: var(--icon-size);
  width: var(--icon-size);
color: currentColor;
}

slot {
  margin: 0;
  padding-inline-start: 0;
  user-select: none;

  @media (width <= 52rem) {
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .page-nav-icon + & {
      display: none;
    }
  }
}

`];
}
if (!customElements.get("moz-page-nav-button")) { customElements.define("moz-page-nav-button", MozPageNavButton); }
