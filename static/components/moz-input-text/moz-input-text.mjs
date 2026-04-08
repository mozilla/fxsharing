/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, css } from "../../dependencies/lit.all.mjs";
import { MozBaseInputElement } from "../../dependencies/lit-utils.mjs";
/**
* A text input custom element.
*
* @tagname moz-input-text
* @property {string} label - The text of the label element
* @property {string} name - The name of the input control
* @property {string} value - The value of the input control
* @property {boolean} disabled - The disabled state of the input control
* @property {boolean} readonly - The readonly state of the input control
* @property {string} iconSrc - The src for an optional icon
* @property {string} description - The text for the description element that helps describe the input control
* @property {string} supportPage - Name of the SUMO support page to link to.
* @property {string} placeholder - Text to display when the input has no value.
* @property {string} ariaLabel - The aria-label text when there is no visible label.
* @property {string} ariaDescription - The aria-description text when there is no visible description.
*/
export default class MozInputText extends MozBaseInputElement {
  static properties = {
    placeholder: {
      type: String,
      fluent: true
    },
    readonly: {
      type: Boolean,
      reflect: true
    }
  };
  static inputLayout = "block";
  constructor() {
    super();
    this.value = "";
    this.readonly = false;
  }
  inputStylesTemplate() {
    return html``;
  }
  handleInput(e) {
    this.value = e.target.value;
  }
  inputTemplate(options = {}) {
    let { type = "text", classes, styles, inputValue } = options;
    return html`
      <input
        id="input"
        type=${type}
        class=${ifDefined(classes)}
        style=${ifDefined(styles)}
        name=${this.name}
        .value=${inputValue || this.value}
        ?disabled=${this.disabled || this.parentDisabled}
        ?readonly=${this.readonly}
        accesskey=${ifDefined(this.accessKey)}
        placeholder=${ifDefined(this.placeholder)}
        aria-label=${ifDefined(this.ariaLabel ?? undefined)}
        aria-describedby="description"
        aria-description=${ifDefined(this.hasDescription ? undefined : this.ariaDescription)}
        @input=${this.handleInput}
        @change=${this.redispatchEvent}
      />
    `;
  }
  static styles = [...MozBaseInputElement.styles ?? [], css`/* From ../../dependencies/moz-input-text.css */
:host {
  --input-text-min-height: var(--button-min-height);
  --input-text-border-color: var(--border-color-interactive);
  --input-text-border-color-disabled: var(--border-color-interactive-disabled);
  --input-text-border: var(--border-width) solid var(--input-text-border-color);
  --input-text-border-radius: var(--border-radius-medium);
  --input-text-background-color: Field;
  --input-text-color: FieldText;
  --input-text-background-color-disabled: var(--button-background-color-disabled);
  --input-text-opacity-disabled: var(--button-opacity-disabled);
  --input-text-icon-size: var(--icon-size-xsmall);
}

#input {
  width: 100%;
  max-width: var(--input-text-max-width);
  min-height: var(--input-text-min-height);
  padding-inline: var(--space-medium);
  border: var(--input-text-border);
  border-radius: var(--input-text-border-radius);
  box-sizing: border-box;
  background-color: var(--input-text-background-color);
  color: var(--input-text-color);

  @media (-moz-platform: macos) {
    font-size: max(1em, 12px);
  }

  &:disabled {
    border-color: var(--input-text-border-color-disabled);
    background-color: var(--input-text-background-color-disabled);
    opacity: var(--input-text-opacity-disabled);
  }

  &.with-icon {
    padding-inline-start: calc(2 * var(--space-medium)  + var(--input-text-icon-size));
    background-repeat: no-repeat;
    background-size: var(--input-text-icon-size);
    background-position: var(--space-medium) center;
    background-image: var(--input-background-icon);
color: var(--icon-color);

    &:dir(rtl) {
      background-position: center right var(--space-medium);
    }
  }

  &[type="search"] {
    --input-background-icon: url("../../assets/search-textbox.svg");
    padding-inline-end: var(--space-xxsmall);
  }

  &::placeholder {
    text-overflow: ellipsis;
  }
}

`];
}
if (!customElements.get("moz-input-text")) { customElements.define("moz-input-text", MozInputText); }
