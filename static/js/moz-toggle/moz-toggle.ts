/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { customElement } from "lit/decorators.js";
import { MozBaseInputElement } from "lit-utils";
import mozToggleCss from "./moz-toggle.css";

/**
 * A simple toggle element that can be used to switch between two states.
 *
 * @tagname moz-toggle
 * @property {boolean} pressed - Whether or not the element is pressed.
 * @property {boolean} disabled - Whether or not the element is disabled.
 * @property {string} label - The label text.
 * @property {string} description - The description text.
 * @property {string} ariaLabel - The aria-label text when there is no visible label.
 * @property {string} ariaDescription - The aria-description text when there is no visible description.
 * @slot support-link - Used to append a moz-support-link to the description.
 * @fires toggle
 *  Custom event indicating that the toggle's pressed state has changed.
 */
@customElement("moz-toggle")
export default class MozToggle extends MozBaseInputElement<HTMLButtonElement> {
  static properties = {
    pressed: { type: Boolean, reflect: true },
  };

  static activatedProperty = "pressed";

  pressed = false;

  get buttonEl() {
    return this.inputEl;
  }

  constructor() {
    super();
    this.pressed = false;
  }

  handleClick() {
    this.pressed = !this.pressed;
    this.dispatchOnUpdateComplete(
      new CustomEvent("toggle", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  inputTemplate() {
    const { pressed, disabled, ariaLabel, handleClick } = this;
    return html`<button
      id="input"
      part="button"
      type="button"
      class="toggle-button"
      name=${this.name}
      value=${this.value}
      ?disabled=${disabled}
      aria-pressed=${pressed}
      aria-label=${ifDefined(ariaLabel ?? undefined)}
      aria-describedby="description"
      aria-description=${ifDefined(
        this.hasDescription ? undefined : this.ariaDescription,
      )}
      accesskey=${ifDefined(this.accessKey)}
      @click=${handleClick}
    ></button>`;
  }

  inputStylesTemplate() {
    return nothing;
  }

  static styles = [MozBaseInputElement.styles, mozToggleCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-toggle": MozToggle;
  }
}
