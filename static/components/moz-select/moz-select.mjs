/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createRef, html, ref, classMap, ifDefined, css } from "../../dependencies/lit.all.mjs";
import { MozBaseInputElement, MozLitElement } from "../../dependencies/lit-utils.mjs";
import "../../dependencies/acorn-icon.mjs";
/** @import { TemplateResult } from "../../dependencies/lit.all.mjs" */
/**
* @typedef {object} SelectOption
* @property {string} value - The value of the option.
* @property {string} label - The display label of the option.
* @property {string} [iconSrc] - The icon source URL for the option.
* @property {boolean} [disabled] - Whether the option is disabled.
* @property {boolean} [hidden] - Whether the option is hidden.
*/
/**
* A select dropdown with options provided via custom `moz-option` elements.
*
* @tagname moz-select
* @property {string} label - The text of the label element
* @property {string} name - The name of the input control
* @property {string} value - The value of the selected option
* @property {boolean} disabled - The disabled state of the input control
* @property {string} iconSrc - The src for an optional icon
* @property {string} description - The text for the description element that helps describe the input control
* @property {string} supportPage - Name of the SUMO support page to link to.
* @property {string} ariaLabel - The aria-label text when there is no visible label.
* @property {string} ariaDescription - The aria-description text when there is no visible description.
* @property {SelectOption[]} options - The array of options, populated by <moz-option> children in the
*     default slot. Do not set directly, these will be overridden by <moz-option> children.
* @property {SelectOption} selectedOption - The currently selected option object.
* @property {number} selectedIndex - The index of the currently selected option.
* @property {boolean} usePanelList - Whether or not to render a panel. Depends on options using icons.
*/
export default class MozSelect extends MozBaseInputElement {
  static properties = {
    options: {
      type: Array,
      state: true
    },
    selectedOption: {
      type: Object,
      state: true
    },
    selectedIndex: {
      type: Number,
      state: true
    },
    usePanelList: {
      type: Boolean,
      state: true
    }
  };
  static inputLayout = "block";
  static queries = {
    panelList: "panel-list",
    panelTrigger: ".panel-trigger"
  };
  constructor() {
    super();
    this.value = "";
    this.options = [];
    this.usePanelList = false;
    this.selectedOption = null;
    this.selectedIndex = 0;
    this.slotRef = createRef();
    this.optionsMutationObserver = new MutationObserver(this.populateOptions.bind(this));
  }
  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    this.optionsMutationObserver.observe(this, {
      attributeFilter: [
        "label",
        "value",
        "iconsrc",
        "disabled",
        "hidden"
      ],
      childList: true,
      subtree: true
    });
  }
  update(changedProperties) {
    super.update(changedProperties);
    if (this.hasUpdated && changedProperties.has("options")) {
      // Match the select's value on initial render or options change.
      this.value = this.inputEl.value;
    }
  }
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    if (changedProperties.has("value") || changedProperties.has("options")) {
      this.selectedIndex = this.options.findIndex((opt) => opt.value === this.value);
      this.selectedOption = this.options[this.selectedIndex] ?? this.options[0];
    }
  }
  /**
  * Gets the icon source for the currently selected option.
  *
  * @returns {string} The icon source URL or empty string.
  */
  get _selectedOptionIconSrc() {
    return this.selectedOption?.iconSrc ?? "";
  }
  /**
  * Internal - populates the select element with options from the light DOM slot.
  */
  populateOptions() {
    if (!this.slotRef.value) {
      this.options = [];
      this.usePanelList = false;
      return;
    }
    let options = [];
    for (const node of this.slotRef.value.assignedNodes()) {
      if (node.localName === "moz-option") {
        options.push({
          value: node.getAttribute("value"),
          label: node.getAttribute("label"),
          iconSrc: node.getAttribute("iconsrc"),
          disabled: node.getAttribute("disabled") !== null,
          hidden: node.getAttribute("hidden") !== null
        });
      } else if (node.localName === "hr") {
        options.push({ separator: true });
      }
    }
    this.options = options;
    this.usePanelList = options.some((opt) => opt.iconSrc);
    // Default to first option if no value set to match native select behavior.
    if (this.usePanelList && !this.value && this.options.length) {
      this.value = this.options[0].value;
    }
  }
  /**
  * Handles change events and updates the selected value.
  *
  * @param {Event} event
  * @memberof MozSelect
  */
  handleStateChange(event) {
    this.value = event.target.value;
  }
  /**
  * Handles change events from the panel-list and dispatches a change event.
  *
  * @param {Event} event - The click event from panel-item selection.
  */
  handlePanelChange(event) {
    this.handleStateChange(event);
    this.redispatchEvent(new Event("change", { bubbles: true }));
  }
  /**
  * Handles the panel being hidden and returns focus to the trigger button.
  */
  handlePanelHidden() {
    this.panelTrigger?.focus();
  }
  /**
  * Toggles the panel-list open/closed state.
  *
  * @param {Event} event - The triggering event.
  */
  togglePanel(event) {
    this.panelList?.toggle(event);
  }
  /**
  * Prevents mousedown on the trigger from propagating to panel-list's document
  * listener, which would close the panel before the click handler can toggle
  * it.
  *
  * @param {MouseEvent} event - The mousedown event.
  */
  handlePanelMousedown(event) {
    event.stopPropagation();
  }
  /**
  * Handles keyboard events on the panel trigger button.
  * Arrow keys change selection (Windows/Linux) or open the panel (Mac).
  * Space opens the panel. Enter is prevented to match native select behavior.
  *
  * @param {KeyboardEvent} event - The keyboard event.
  */
  handlePanelKeydown(event) {
    if (this.panelList?.open) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (navigator.platform.includes("Mac")) {
          // Mac - open the menu
          this.togglePanel(event);
        } else {
          // Windows/Linux - select the next option
          this.selectNextOption(event.key === "ArrowDown" ? 1 : -1);
        }
        break;
      case "Enter":
        event.preventDefault();
        break;
      case " ":
        event.preventDefault();
        this.togglePanel(event);
        break;
    }
  }
  /**
  * Selects the next enabled option in the given direction. Skips disabled and
  * hidden options.
  *
  * @param {number} direction - The direction to move (1 for next, -1 for
  * previous).
  */
  selectNextOption(direction) {
    let currentIndex = this.selectedIndex;
    let options = this.options;
    for (let i = 1; i < options.length; i++) {
      let nextIndex = currentIndex + direction * i;
      let nextOption = options[nextIndex];
      if (nextOption && !nextOption.disabled && !nextOption.hidden) {
        this.value = nextOption.value;
        this.redispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
  }
  /**
  * @type {MozBaseInputElement['inputStylesTemplate']}
  */
  inputStylesTemplate() {
    return html` `;
  }
  /**
  * Renders the icon for the currently selected option.
  *
  * @returns {TemplateResult | null}
  */
  selectedOptionIconTemplate() {
    if (this._selectedOptionIconSrc) {
      return html`<acorn-icon
        src=${this._selectedOptionIconSrc}
        role="presentation"
        class="select-option-icon"></acorn-icon>`;
    }
    return null;
  }
  /**
  * Renders the native select element (used when options don't have icons).
  *
  * @returns {TemplateResult}
  */
  selectTemplate() {
    return html`<select
      id="input"
      name=${this.name}
      .value=${this.value}
      accesskey=${this.accessKey}
      @input=${this.handleStateChange}
      @change=${this.redispatchEvent}
      ?disabled=${this.disabled || this.parentDisabled}
      aria-label=${ifDefined(this.ariaLabel ?? undefined)}
      aria-describedby="description"
      aria-description=${ifDefined(this.hasDescription ? undefined : this.ariaDescription)}
    >
      ${this.options.map((option) => option.separator ? html`<hr />` : html`
              <option
                value=${option.value}
                .selected=${option.value == this.value}
                ?disabled=${option.disabled}
                ?hidden=${option.hidden}
              >
                ${option.label}
              </option>
            `)}
    </select>`;
  }
  /**
  * Renders the button trigger for the panel-list (used when options have
  * icons).
  *
  * @returns {TemplateResult}
  */
  panelTargetTemplate() {
    return html`<button
      class="panel-trigger"
      aria-haspopup="menu"
      aria-expanded=${this.panelList?.open ? "true" : "false"}
      @click=${this.togglePanel}
      @keydown=${this.handlePanelKeydown}
      @mousedown=${this.handlePanelMousedown}
      ?disabled=${this.disabled || this.parentDisabled}
    >
      ${this.selectedOption?.label}
    </button>`;
  }
  /**
  * Renders the panel-list dropdown menu (used when options have icons).
  *
  * @returns {TemplateResult}
  */
  panelListTemplate() {
    return html`<panel-list
      .value=${this.value}
      min-width-from-anchor
      id="input"
      @click=${this.handlePanelChange}
      @hidden=${this.handlePanelHidden}
    >
      ${this.options.map((option) => option.separator ? html`<hr />` : html`<panel-item
              .value=${option.value}
              ?selected=${option.value == this.value}
              ?disabled=${option.disabled}
              ?hidden=${option.hidden}
              icon=${ifDefined(option.iconSrc)}
              style=${option.iconSrc ? `--select-item-icon-url: url(${option.iconSrc})` : ""}
            >
              ${option.label}
            </panel-item>`)}
    </panel-list>`;
  }
  /**
  * Renders the main input template with either a native select or panel-list.
  *
  * @returns {TemplateResult}
  */
  inputTemplate() {
    return html`
      <div
        class=${classMap({
      "select-wrapper": true,
      "with-icon": !!this._selectedOptionIconSrc
    })}
      >
        ${this.selectedOptionIconTemplate()}
        ${!this.usePanelList ? this.selectTemplate() : this.panelTargetTemplate()}
        <acorn-icon
          src="${new URL("../../assets/arrow-down.svg", import.meta.url).href}"
          role="presentation"
          class="select-chevron-icon"></acorn-icon>
      </div>
      ${this.usePanelList ? this.panelListTemplate() : ""}
      <slot
        @slotchange=${this.populateOptions}
        hidden
        ${ref(this.slotRef)}
      ></slot>
    `;
  }
  static styles = [...MozBaseInputElement.styles ?? [], css`/* From chrome://global/content/elements/moz-select.css */
:host {
  --select-border: var(--button-border);
  --select-border-radius: var(--button-border-radius);
  --select-border-color-hover: var(--button-border-color-hover);
  --select-border-color-disabled: var(--button-border-color-disabled);
  --select-background-color: var(--button-background-color);
  --select-background-color-hover: var(--button-background-color-hover);
  --select-background-color-disabled: var(--button-background-color-disabled);
  --select-opacity-disabled: var(--button-opacity-disabled);
  --select-margin-block: var(--input-margin-block-adjust);
  --select-margin-inline: var(--input-margin-inline-start-adjust) var(--space-small);
  --select-min-height: var(--button-min-height);
  --select-font-size: var(--button-font-size);
  --select-font-weight: var(--button-font-weight);
  --select-option-font-weight: var(--font-weight);
  --select-text-color: var(--button-text-color);
  --select-text-color-hover: var(--button-text-color-hover);
  --select-text-color-disabled: var(--button-text-color-disabled);
  --select-option-text-color: var(--text-color);
  --select-icon-fill: var(--button-icon-fill);
}

:host([inputlayout="inline-end"]) {
  --select-margin-block: 0;
  --select-margin-inline: 0;
}

.select-wrapper {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  border: var(--select-border);
  border-radius: var(--select-border-radius);
  background-color: var(--select-background-color);
  color: var(--select-text-color);
  margin-block: var(--select-margin-block);
  margin-inline: var(--select-margin-inline);
  min-width: var(--select-min-width);
  max-width: var(--select-max-width);
  &:hover, &:has(select:open), &:has( + [open]) {
    border-color: var(--select-border-color-hover);
    background-color: var(--select-background-color-hover);
    color: var(--select-text-color-hover);
  }

  &:has( > :disabled) {
    border-color: var(--select-border-color-disabled);
    background-color: var(--select-background-color-disabled);
    color: var(--select-text-color-disabled);
    opacity: var(--select-opacity-disabled);
  }

  &:has(:focus-visible) {
    outline: var(--focus-outline);
    outline-offset: var(--focus-outline-offset);
  }
}

.panel-trigger {
  display: flex;
  align-items: center;
  outline: none;
  font-family: inherit;
}

panel-item[icon]::part(button) {
  background-image: var(--select-item-icon-url);
}

panel-item[selected] {
  background-color: var(--button-background-color-selected);
  border-color: var(--button-border-color-selected);
  color: var(--button-text-color-selected);
}

select, .panel-trigger {
  border-radius: var(--select-border-radius);
  padding-inline: var(--space-large) var(--space-xxlarge);
  min-height: var(--select-min-height);
  width: 100%;
  font-size: var(--select-font-size);
  font-weight: var(--select-font-weight);
  background-color: #0000;
  color: inherit;
  appearance: none;
  border: none;
}

select {
  border: none;
  padding-block: var(--space-xsmall);
  margin: 0;

  &:focus-visible {
    outline: none;
    outline-offset: unset;
  }

  & option {
    font-weight: var(--select-option-font-weight);
    color: var(--select-option-text-color);

    &:disabled {
      color: var(--text-color-disabled);
    }
  }
}

.select-option-icon, .select-chevron-icon {
  position: absolute;
  width: var(--icon-size);
  height: var(--icon-size);
  pointer-events: none;
}

.select-option-icon {
  inset-inline-start: var(--space-large);
  opacity: 0;
  transform: scale(0);
  transition: opacity .3s, transform .3s;

  @media (prefers-reduced-motion) {
    transition: unset;
  }
}

.select-chevron-icon {
  inset-inline-end: var(--space-medium);
}

.with-icon .panel-trigger {
  padding-inline-start: calc(var(--space-large)  + var(--icon-size)  + var(--space-small));
}

.with-icon:has(.panel-trigger) .select-option-icon {
  opacity: 1;
  transform: scale(1);
}

`];
}
if (!customElements.get("moz-select")) { customElements.define("moz-select", MozSelect); }
/**
* A custom option element for use in moz-select.
*
* @tagname moz-option
* @property {string} value - The value of the option
* @property {string} label - The label of the option
* @property {string} iconSrc - The path to the icon of the the option
* @property {boolean} disabled - Whether the option is disabled
* @property {boolean} hidden - Whether the option is hidden
*/
export class MozOption extends MozLitElement {
  static properties = {
    value: {
      type: String,
      reflect: true
    },
    label: {
      type: String,
      reflect: true,
      fluent: true
    },
    iconSrc: {
      type: String,
      reflect: true
    },
    disabled: {
      type: Boolean,
      reflect: true
    },
    hidden: {
      type: Boolean,
      reflect: true
    }
  };
  constructor() {
    super();
    this.value = "";
    this.label = "";
    this.iconSrc = "";
    this.disabled = false;
    this.hidden = false;
  }
  render() {
    // This is just a placeholder to pass values into moz-select.
    return "";
  }
}
if (!customElements.get("moz-option")) { customElements.define("moz-option", MozOption); }
