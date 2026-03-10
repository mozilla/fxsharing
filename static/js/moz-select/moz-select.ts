/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import type { PropertyValues } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { MozBaseInputElement, MozLitElement } from "lit-utils";
import mozSelectCss from "./moz-select.css";

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
 * @property {boolean} required - Is this input required
 * @property {array} options - The array of options, populated by <moz-option> children in the
 *     default slot. Do not set directly, these will be overridden by <moz-option> children.
 */
export default class MozSelect extends MozBaseInputElement<HTMLSelectElement> {
  static properties = {
    options: { type: Array, state: true },
  };
  static inputLayout = "block";

  #optionIconSrcMap = new Map<string, string | null>();

  options: Array<
    | {
        value: string | null;
        label: string | null;
        iconSrc: string | null;
        disabled: boolean;
        hidden: boolean;
      }
    | { separator: true }
  > = [];

  slotRef = createRef<HTMLSlotElement>();
  optionsMutationObserver: MutationObserver;

  constructor() {
    super();
    this.value = "";
    this.optionsMutationObserver = new MutationObserver(
      this.populateOptions.bind(this),
    );
  }

  firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    this.optionsMutationObserver.observe(this, {
      attributeFilter: ["label", "value", "iconsrc", "disabled"],
      childList: true,
      subtree: true,
    });
  }

  update(changedProperties: PropertyValues<this>) {
    super.update(changedProperties);
    if (this.hasUpdated && changedProperties.has("options")) {
      // Match the select's value on initial render or options change.
      this.value = this.inputEl.value;
    }
  }

  get _selectedOptionIconSrc() {
    return this.#optionIconSrcMap.get(this.value) ?? "";
  }

  /**
   * Internal - populates the select element with options from the light DOM slot.
   */
  populateOptions() {
    this.options = [];
    this.#optionIconSrcMap.clear();

    if (!this.slotRef.value) {
      return;
    }

    for (const node of this.slotRef.value.assignedElements()) {
      if (node.localName === "moz-option") {
        const optionValue = node.getAttribute("value");
        const optionLabel = node.getAttribute("label");
        const optionIconSrc = node.getAttribute("iconsrc");
        const disabled = node.hasAttribute("disabled");
        const hidden = node.hasAttribute("hidden");
        this.options.push({
          value: optionValue,
          label: optionLabel,
          iconSrc: optionIconSrc,
          disabled,
          hidden,
        });
        if (optionValue) {
          this.#optionIconSrcMap.set(optionValue, optionIconSrc);
        }
      }
      if (node.localName === "hr") {
        this.options.push({ separator: true });
      }
    }
  }

  /**
   * Handles change events and updates the selected value.
   *
   * @param {Event} event
   * @memberof MozSelect
   */
  handleStateChange(event: Event & { target: HTMLSelectElement }) {
    this.value = event.target.value;
  }

  selectedOptionIconTemplate() {
    if (this._selectedOptionIconSrc) {
      return html`<div
        class="contextual-icon select-option-icon"
        style=${styleMap({
          "--icon-url": `url("${this._selectedOptionIconSrc}")`,
        })}
        role="presentation"
      ></div>`;
    }
    return null;
  }

  inputTemplate() {
    const classes = classMap({
      "select-wrapper": true,
      "with-icon": !!this._selectedOptionIconSrc,
    });

    return html`
      <div class=${ifDefined(classes)}>
        ${this.selectedOptionIconTemplate()}
        <select
          id="input"
          name=${this.name}
          .value=${this.value}
          accesskey=${this.accessKey}
          @input=${this.handleStateChange}
          @change=${this.redispatchEvent}
          ?disabled=${this.disabled || this.parentDisabled}
          ?required=${this.required}
          aria-label=${ifDefined(this.ariaLabel ?? undefined)}
          aria-describedby="description"
          aria-description=${ifDefined(
            this.hasDescription ? undefined : this.ariaDescription,
          )}
        >
          ${this.options.map((option) =>
            "separator" in option
              ? html`<hr />`
              : html`
                  <option
                    value=${option.value}
                    .selected=${option.value == this.value}
                    ?disabled=${option.disabled}
                    ?hidden=${option.hidden}
                  >
                    ${option.label}
                  </option>
                `,
          )}
        </select>
        <div
          class="contextual-icon select-chevron-icon"
          role="presentation"
        ></div>
      </div>
      <slot
        @slotchange=${this.populateOptions}
        hidden
        ${ref(this.slotRef)}
      ></slot>
    `;
  }

  static styles = [MozBaseInputElement.styles, mozSelectCss];
}
customElements.define("moz-select", MozSelect);

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
    // Reflect the attribute so that moz-select can detect changes with a MutationObserver
    value: { type: String, reflect: true },
    // Reflect the attribute so that moz-select can detect changes with a MutationObserver
    label: { type: String, reflect: true, fluent: true },
    iconSrc: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
  };

  value = "";
  label = "";
  iconSrc = "";
  disabled = false;

  render() {
    // This is just a placeholder to pass values into moz-select.
    return "";
  }
}
customElements.define("moz-option", MozOption);

declare global {
  interface HTMLElementTagNameMap {
    "moz-select": MozSelect;
    "moz-option": MozOption;
  }
}
