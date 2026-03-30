/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, classMap, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "../moz-label/moz-label.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* Controls moz-button behavior when menuId property is set.
* Helps to integrate moz-button with panel-list.
*/
class MenuController {
  /** @type {HTMLElement} */
  host;
  /** @type {string} */
  #menuId;
  /** @type {HTMLElement | null} */
  #menuEl;
  /** @type {boolean} */
  #hostIsSplitButton;
  constructor(host) {
    this.host = host;
    host.addController(this);
  }
  hostConnected() {
    this.hostUpdated();
  }
  hostDisconnected() {
    this.#menuId = null;
    this.#menuEl = null;
    this.removePanelListListeners();
  }
  hostUpdated() {
    let hostMenuId = this.host.menuId;
    let hostIsSplitButton = this.host.isSplitButton;
    if (this.#menuId === hostMenuId && this.#hostIsSplitButton === hostIsSplitButton) {
      return;
    }
    if (this.#menuEl?.localName == "panel-list") {
      this.panelListCleanUp();
    }
    this.#menuId = hostMenuId;
    this.#hostIsSplitButton = hostIsSplitButton;
    // Check to see if a menuId has been added to host, or changed
    if (this.#menuId) {
      this.#menuEl = this.getPanelList();
      if (this.#menuEl?.localName == "panel-list") {
        this.panelListSetUp();
      }
    }
    // Check to see if menuId has been removed from host
    if (!this.#menuId) {
      this.#menuEl = null;
      this.host.removeController(this);
    }
  }
  /**
  * Retrieves the panel-list element matching the host's menuId.
  *
  * @returns {HTMLElement | null}
  */
  getPanelList() {
    let root = this.host.getRootNode();
    let menuEl = null;
    while (root) {
      menuEl = root.querySelector?.(`#${this.#menuId}`);
      if (menuEl) {
        break;
      }
      if (root instanceof ShadowRoot) {
        root = root.host?.getRootNode();
      } else {
        break;
      }
    }
    return menuEl;
  }
  /**
  * Handles opening/closing the panel-list when the host is clicked or activated via keyboard.
  *
  * @param {MouseEvent|KeyboardEvent} event
  */
  openPanelList = (event) => {
    if (event.type == "mousedown" && event.button == 0 || event.inputSource == MouseEvent.MOZ_SOURCE_KEYBOARD || !event.detail) {
      if (this.#hostIsSplitButton) {
        this.#menuEl?.toggle(event, this.host.chevronButtonEl);
      } else {
        this.#menuEl?.toggle(event, this.host);
      }
    }
  };
  /**
  * Removes event listeners related to panel-list from the host.
  */
  removePanelListListeners() {
    if (this.#hostIsSplitButton) {
      this.host.chevronButtonEl?.removeEventListener("click", this.openPanelList);
      this.host.chevronButtonEl?.removeEventListener("mousedown", this.openPanelList);
    } else {
      this.host.removeEventListener("click", this.openPanelList);
      this.host.removeEventListener("mousedown", this.openPanelList);
    }
  }
  /**
  * Sets up the host for integration with panel-list,
  * adding necessary event listeners and ARIA attributes.
  */
  panelListSetUp() {
    if (this.#hostIsSplitButton) {
      this.host.chevronButtonEl?.addEventListener("click", this.openPanelList);
      this.host.chevronButtonEl?.addEventListener("mousedown", this.openPanelList);
    } else {
      this.host.addEventListener("click", this.openPanelList);
      this.host.addEventListener("mousedown", this.openPanelList);
    }
    this.host.ariaHasPopup = "menu";
    this.host.ariaExpanded = this.#menuEl?.open ? "true" : "false";
  }
  /**
  * Cleans up panel-list integration,
  * removing event listeners and clearing ARIA attributes.
  */
  panelListCleanUp() {
    this.removePanelListListeners();
    this.host.ariaHasPopup = null;
    this.host.ariaExpanded = null;
  }
}
/**
* A button with multiple types and two sizes.
*
* @tagname moz-button
* @property {string} label - The button's label, will be overridden by slotted content.
* @property {string} type - The button type.
*   Options: default, primary, destructive, icon, icon ghost, ghost.
* @property {string} size - The button size.
*   Options: default, small.
* @property {boolean} disabled - The disabled state.
* @property {string} title - The button's title attribute, used in shadow DOM and therefore not as an attribute on moz-button.
* @property {string} titleAttribute - Internal, map title attribute to the title JS property.
* @property {string} tooltipText - Set the title property, the title attribute will be used first.
* @property {string} ariaLabel - The button's aria-label attribute, used in shadow DOM and therefore not as an attribute on moz-button.
* @property {string} ariaHasPopup - The button's aria-haspopup attribute, that indicates that a popup element can be triggered by the button.
* @property {string} ariaExpanded - The button's aria-expanded attribute, that indicates whether or not the controlled elements are displayed or hidden.
* @property {string} ariaPressed - The button's aria-pressed attribute, used in shadow DOM and therefore not as an attribute on moz-button.
* @property {string} iconSrc - Path to the icon that should be displayed in the button.
* @property {string} ariaLabelAttribute - Internal, map aria-label attribute to the ariaLabel JS property.
* @property {string} ariaHasPopupAttribute - Internal, map aria-haspopup attribute to the ariaHasPopup JS property.
* @property {string} ariaExpandedAttribute - Internal, map aria-expanded attribute to the ariaExpanded JS property.
* @property {string} ariaPressedAttribute - Internal, map aria-pressed attribute to the ariaPressed JS property.
* @property {string} hasVisibleLabel - Internal, tracks whether or not the button has a visible label.
* @property {boolean} attention - Show a dot notification on the button if true.
* @property {boolean} parentDisabled - When the parent of this component is disabled.
* @property {string} iconPosition - The icon's position relative to the button label.
*   Options: start, end.
* @property {string} menuId - A CSS selector string that identifies the associated menu element controlled by the button.
* @property {HTMLButtonElement} buttonEl - The internal button element in the shadow DOM.
* @property {HTMLButtonElement} slotEl - The internal slot element in the shadow DOM.
* @cssproperty [--button-outer-padding-inline] - Used to set the outer inline padding of toolbar style buttons
* @cssproperty [--button-outer-padding-block] - Used to set the outer block padding of toolbar style buttons.
* @cssproperty [--button-outer-padding-inline-start] - Used to set the outer inline-start padding of toolbar style buttons
* @cssproperty [--button-outer-padding-inline-end] - Used to set the outer inline-end padding of toolbar style buttons
* @cssproperty [--button-outer-padding-block-start] - Used to set the outer block-start padding of toolbar style buttons
* @cssproperty [--button-outer-padding-block-end] - Used to set the outer block-end padding of toolbar style buttons
* @slot default - The button's content, overrides label property.
* @fires click - The click event.
*/
export default class MozButton extends MozLitElement {
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true
  };
  static properties = {
    label: {
      type: String,
      reflect: true,
      fluent: true
    },
    type: {
      type: String,
      reflect: true
    },
    size: {
      type: String,
      reflect: true
    },
    disabled: {
      type: Boolean,
      reflect: true
    },
    title: {
      type: String,
      mapped: true
    },
    tooltipText: {
      type: String,
      fluent: true
    },
    ariaLabel: {
      type: String,
      mapped: true
    },
    ariaHasPopup: {
      type: String,
      mapped: true
    },
    ariaExpanded: {
      type: String,
      mapped: true
    },
    ariaPressed: {
      type: String,
      mapped: true
    },
    iconSrc: { type: String },
    hasVisibleLabel: {
      type: Boolean,
      state: true
    },
    accessKey: {
      type: String,
      mapped: true
    },
    attention: { type: Boolean },
    iconPosition: {
      type: String,
      reflect: true
    },
    menuId: {
      type: String,
      reflect: true
    },
    parentDisabled: { type: Boolean }
  };
  static queries = {
    buttonEl: "#main-button",
    chevronButtonEl: "#chevron-button",
    slotEl: "slot",
    backgroundEl: "#main-button .button-background"
  };
  constructor() {
    super();
    this.type = "default";
    this.size = "default";
    this.disabled = false;
    this.hasVisibleLabel = !!this.label;
    this.attention = false;
    this.iconPosition = "start";
    this.menuId = "";
    this.parentDisabled = undefined;
  }
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("menuId")) {
      if (this.menuId && !this._menuController) {
        this._menuController = new MenuController(this);
      }
      if (!this.menuId && this._menuController) {
        this._menuController = null;
      }
    }
  }
  get isSplitButton() {
    return this.type === "split";
  }
  // Delegate clicks on host to the button element.
  click() {
    this.buttonEl.click();
  }
  checkForLabelText() {
    this.hasVisibleLabel = this.slotEl?.assignedNodes().some((node) => node.textContent.trim());
  }
  labelTemplate() {
    if (this.label) {
      return this.label;
    }
    return html`<slot @slotchange=${this.checkForLabelText}></slot>`;
  }
  iconTemplate(position) {
    if (this.iconSrc && position == this.iconPosition) {
      return html`<acorn-icon src=${this.iconSrc} role="presentation"></acorn-icon>`;
    }
    return null;
  }
  chevronButtonTemplate() {
    if (this.isSplitButton) {
      return html`<button
        id="chevron-button"
        size=${this.size}
        ?disabled=${this.disabled || this.parentDisabled}
        data-l10n-id="moz-button-more-options" aria-label="More Options" title="More options"
        aria-labelledby="main-button chevron-button"
        aria-expanded=${ifDefined(this.ariaExpanded)}
        aria-haspopup=${ifDefined(this.ariaHasPopup)}
        @click=${(e) => e.stopPropagation()}
        @mousedown=${(e) => e.stopPropagation()}
      >
        <span
          class="button-background"
          part="chevron-button"
          type=${this.type}
          size=${this.size}
        >
          <acorn-icon
            src="${new URL("../../assets/arrow-down.svg", import.meta.url).href}"
            role="presentation"></acorn-icon>
        </span>
      </button>`;
    }
    return null;
  }
  render() {
    return html`
      <button
        id="main-button"
        ?disabled=${this.disabled || this.parentDisabled}
        title=${ifDefined(this.title || this.tooltipText)}
        aria-label=${ifDefined(this.ariaLabel)}
        aria-expanded=${ifDefined(this.isSplitButton ? undefined : this.ariaExpanded)}
        aria-haspopup=${ifDefined(this.isSplitButton ? undefined : this.ariaHasPopup)}
        aria-pressed=${ifDefined(this.ariaPressed)}
        accesskey=${ifDefined(this.accessKey)}
      >
        <span
          class=${classMap({
      labelled: this.label || this.hasVisibleLabel,
      "button-background": true,
      badged: (this.iconSrc || this.type.includes("icon")) && this.attention
    })}
          part="button"
          type=${this.type}
          size=${this.size}
        >
          ${this.iconTemplate("start")}
          <label
            is="moz-label"
            shownaccesskey=${ifDefined(this.accessKey)}
            part="moz-button-label"
          >
            ${this.labelTemplate()}
          </label>
          ${this.iconTemplate("end")}
        </span>
      </button>
      ${this.chevronButtonTemplate()}
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-button.css */
:host([hidden]) {
  display: none !important;
}

:host {
  display: inline-block;
  height: fit-content;
  width: fit-content;
  --button-alignment: center;
}

:host([type="split"]) {
  display: flex;
  justify-content: flex-start;
  gap: var(--space-xxsmall);

  & button {
    min-width: fit-content;
  }

  & #main-button {
    padding-inline-end: 0;
  }

  & #chevron-button {
    padding-inline-start: 0;
  }

  & .button-background {
    height: 100%;
  }

  & #main-button .button-background {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }

  & #chevron-button .button-background {
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
}

button {
  appearance: none;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  width: 100%;

  &:focus-visible {
    outline: none;
  }

  padding-inline-start: var(--button-outer-padding-inline-start, var(--button-outer-padding-inline));
  padding-inline-end: var(--button-outer-padding-inline-end, var(--button-outer-padding-inline));
  padding-block-start: var(--button-outer-padding-block-start, var(--button-outer-padding-block));
  padding-block-end: var(--button-outer-padding-block-end, var(--button-outer-padding-block));
}

@media not ((prefers-contrast) or (forced-colors)) {
  button.badged:after {
    background-color: var(--button-attention-dot-color, var(--attention-dot-color));
  }
}

.button-background {
  box-sizing: border-box;
  min-height: var(--button-min-height);
  border: var(--button-border);
  border-radius: var(--button-border-radius);
  background-color: var(--button-background-color);
  color: var(--button-text-color);
  padding: var(--button-padding);
  font-weight: var(--button-font-weight);
  font-size: var(--button-font-size);
  display: flex;
  justify-content: var(--button-alignment);
  align-items: center;
  position: relative;

  &[size="small"] {
    min-height: var(--button-min-height-small);
    padding-block: var(--space-xxsmall);
    font-size: var(--button-font-size-small);
  }

  &.badged:after {
    content: "";
    position: absolute;
    height: 6px;
    width: 6px;
    inset-block-start: var(--space-xxsmall);
    inset-inline-end: var(--space-xxsmall);
    background-color: var(--attention-dot-color);
    border-radius: var(--border-radius-circle);
  }

  button:hover > & {
    background-color: var(--button-background-color-hover);
    border-color: var(--button-border-color-hover);
    color: var(--button-text-color-hover);
  }

  button:hover:active:not(:disabled) > & {
    background-color: var(--button-background-color-active);
    border-color: var(--button-border-color-active);
    color: var(--button-text-color-active);
  }

  button:is([aria-expanded="true"], [aria-pressed="true"]):not(:hover, :disabled) > & {
    background-color: var(--button-background-color-selected);
    border-color: var(--button-border-color-selected);
    color: var(--button-text-color-selected);
  }

  button:disabled > & {
    background-color: var(--button-background-color-disabled);
    border-color: var(--button-border-color-disabled);
    color: var(--button-text-color-disabled);
    opacity: var(--button-opacity-disabled);
  }

  button:focus-visible > & {
    outline: var(--focus-outline);
    outline-offset: var(--focus-outline-offset);
  }

  &[type="primary"] {
    background-color: var(--button-background-color-primary);
    border-color: var(--button-border-color-primary);
    color: var(--button-text-color-primary);

    button:hover > & {
      background-color: var(--button-background-color-primary-hover);
      border-color: var(--button-border-color-primary-hover);
      color: var(--button-text-color-primary-hover);
    }

    button:hover:active:not(:disabled) > & {
      background-color: var(--button-background-color-primary-active);
      border-color: var(--button-border-color-primary-active);
      color: var(--button-text-color-primary-active);
    }

    button:is([aria-expanded="true"], [aria-pressed="true"]):not(:hover, :disabled) > & {
      background-color: var(--button-background-color-primary-selected);
      border-color: var(--button-border-color-primary-selected);
      color: var(--button-text-color-primary-selected);
    }

    button:disabled > & {
      background-color: var(--button-background-color-primary-disabled);
      border-color: var(--button-border-color-primary-disabled);
      color: var(--button-text-color-primary-disabled);
    }
  }

  &[type="destructive"] {
    background-color: var(--button-background-color-destructive);
    border-color: var(--button-border-color-destructive);
    color: var(--button-text-color-destructive);

    button:hover > & {
      background-color: var(--button-background-color-destructive-hover);
      border-color: var(--button-border-color-destructive-hover);
      color: var(--button-text-color-destructive-hover);
    }

    button:hover:active:not(:disabled) > & {
      background-color: var(--button-background-color-destructive-active);
      border-color: var(--button-border-color-destructive-active);
      color: var(--button-text-color-destructive-active);
    }

    button:is([aria-expanded="true"], [aria-pressed="true"]):not(:hover, :disabled) > & {
      background-color: var(--button-background-color-destructive-selected);
      border-color: var(--button-border-color-destructive-selected);
      color: var(--button-text-color-destructive-selected);
    }

    button:disabled > & {
      background-color: var(--button-background-color-destructive-disabled);
      border-color: var(--button-border-color-destructive-disabled);
      color: var(--button-text-color-destructive-disabled);
    }
  }

  &[type~="ghost"] {
    background-color: var(--button-background-color-ghost);
    border-color: var(--button-border-color-ghost);
    color: var(--button-text-color-ghost);

    button:hover > & {
      background-color: var(--button-background-color-ghost-hover);
      border-color: var(--button-border-color-ghost-hover);
      color: var(--button-text-color-ghost-hover);
    }

    button:hover:active:not(:disabled) > & {
      background-color: var(--button-background-color-ghost-active);
      border-color: var(--button-border-color-ghost-active);
      color: var(--button-text-color-ghost-active);
    }

    button:is([aria-expanded="true"], [aria-pressed="true"]):not(:hover, :disabled) > & {
      background-color: var(--button-background-color-ghost-selected);
      border-color: var(--button-border-color-ghost-selected);
      color: var(--button-text-color-ghost-selected);
    }

    button:disabled > & {
      background-color: var(--button-background-color-ghost-disabled);
      border-color: var(--button-border-color-ghost-disabled);
      color: var(--button-text-color-ghost-disabled);
    }
  }

  &.labelled {
    gap: var(--space-small);
  }

  &[type~="icon"]:not(.labelled) {
    background-size: var(--icon-size);
    background-position: center;
    background-repeat: no-repeat;
  }

  &[type~="icon"]:not(.labelled), &:not(.labelled):has(img, acorn-icon) {
    width: var(--button-size-icon);
    height: var(--button-size-icon);
    padding: var(--button-padding-icon);

    &[size="small"] {
      width: var(--button-size-icon-small);
      height: var(--button-size-icon-small);
    }
  }

  & img, & acorn-icon, &[type~="icon"]:not(.labelled) {color: var(--button-icon-fill);
}

  & img, & acorn-icon {
    width: var(--icon-size);
    height: var(--icon-size);
    pointer-events: none;
  }
}

`];
}
if (!customElements.get("moz-button")) { customElements.define("moz-button", MozButton); }
