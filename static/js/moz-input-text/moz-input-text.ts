/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { MozBaseInputElement } from "lit-utils";
import { type classMap } from "lit/directives/class-map.js";
import { type styleMap } from "lit/directives/style-map.js";
import mozInputTextCss from "./moz-input-text.css";
/**
 * A text input custom element.
 *
 * @tagname moz-input-text
 * @property {string} label - The text of the label element
 * @property {string} name - The name of the input control
 * @property {string} value - The value of the input control
 * @property {string} type - The type of the input control
 * @property {boolean} disabled - The disabled state of the input control
 * @property {boolean} readonly - The readonly state of the input control
 * @property {string} iconSrc - The src for an optional icon
 * @property {string} description - The text for the description element that helps describe the input control
 * @property {string} supportPage - Name of the SUMO support page to link to.
 * @property {string} placeholder - Text to display when the input has no value.
 * @property {boolean} required - Is this input required
 * @property {string} pattern - Pattern for field validation
 * @property {string} ariaLabel - The aria-label text when there is no visible label.
 * @property {string} ariaDescription - The aria-description text when there is no visible description.
 */
export default class MozInputText extends MozBaseInputElement {
  static inputLayout = "block";
  static properties = {
    placeholder: { type: String, fluent: true },
    readonly: { type: Boolean, reflect: true },
    type: { type: String },
  };

  readonly = false;
  placeholder?: string;
  type?: string;

  constructor() {
    super();
    this.value = "";
  }

  handleInput(e: Event & { target: HTMLInputElement }) {
    this.value = e.target.value;
  }

  inputTemplate(
    options: Partial<{
      readonly type: string;
      readonly classes: ReturnType<typeof classMap>;
      readonly styles: ReturnType<typeof styleMap>;
      readonly inputValue: string;
    }> = {},
  ) {
    const { type = this.type ?? "text", classes, styles, inputValue } = options;

    return html`
      <input
        id="input"
        type=${type}
        class=${ifDefined(classes)}
        style=${ifDefined(styles)}
        name=${this.name}
        ?disabled=${this.disabled || this.parentDisabled}
        ?readonly=${this.readonly}
        ?required=${this.required}
        pattern=${ifDefined(this.pattern)}
        .value=${inputValue || this.value}
        accesskey=${ifDefined(this.accessKey)}
        placeholder=${ifDefined(this.placeholder)}
        aria-label=${ifDefined(this.ariaLabel ?? undefined)}
        aria-describedby="description"
        aria-description=${ifDefined(
          this.hasDescription ? undefined : this.ariaDescription,
        )}
        @input=${this.handleInput}
        @change=${this.redispatchEvent}
      />
    `;
  }

  static styles = [MozBaseInputElement.styles, mozInputTextCss];
}
customElements.define("moz-input-text", MozInputText);

declare global {
  interface HTMLElementTagNameMap {
    "moz-input-text": MozInputText;
  }
}
