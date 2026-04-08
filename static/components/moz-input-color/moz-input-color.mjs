/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* @tagname moz-input-color
* @property {string} [value] - A CSS hex value of the initial color shown in the swatch area.
* @property {string} [name] - Any name that will be associated with the component's nested `input` element. Useful when used in `form`s.
* @property {string} label - The text of the label.
*/
export default class MozInputColor extends MozLitElement {
  static properties = {
    value: { type: String },
    name: { type: String },
    label: {
      type: String,
      fluent: true
    }
  };
  static queries = { inputEl: ".swatch" };
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true
  };
  constructor() {
    super();
    this.name = "";
    this.label = "";
    this.value = "";
  }
  /**
  * @param {Event} e
  */
  updateInputFromEvent(e) {
    /**
    * @type {HTMLInputElement}
    */
    const input = e.target;
    this.value = input.value;
  }
  /**
  * Dispatches an event from the host element so that outside
  * listeners can react to these events
  *
  * @param {Event} e
  * @memberof MozBaseInputElement
  */
  redispatchEvent(e) {
    this.updateInputFromEvent(e);
    let { bubbles, cancelable, composed, type } = e;
    let newEvent = new Event(type, {
      bubbles,
      cancelable,
      composed
    });
    this.dispatchEvent(newEvent);
  }
  render() {
    return html`
      <label title=${this.value}>
        <input
          type="color"
          name=${ifDefined(this.name)}
          .value=${this.value}
          class="swatch"
          @input=${this.updateInputFromEvent}
          @change=${this.redispatchEvent}
        />
        <span>${this.label}</span>
        <acorn-icon
          class="icon"
          alt=""
          src="${new URL("../../assets/edit-outline.svg", import.meta.url).href}"></acorn-icon>
      </label>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-input-color.css */
:host {
  --moz-input-color-swatch-size: 24px;
  display: flex;
  align-items: center;
}

label {
  display: flex;
  align-self: stretch;
  align-items: center;
  flex-grow: 1;
  padding-inline: var(--space-medium);
  padding-block: var(--space-small);
  gap: var(--space-small);
  cursor: pointer;
  border: var(--border-width) solid var(--border-color-interactive);
  border-radius: var(--border-radius-medium);
  background-color: var(--button-background-color-ghost);
  color: var(--button-text-color);
}

label:hover {
  border-color: var(--border-color-interactive-hover);
  background-color: var(--button-background-color-ghost-hover);
  color: var(--button-text-color-hover);
}

label:hover:active {
  border-color: var(--border-color-interactive-active);
  background-color: var(--button-background-color-ghost-active);
  color: var(--button-text-color-active);
  outline: none;
}

label:focus-within {
  outline: var(--focus-outline);
  outline-offset: var(--focus-outline-offset);
}

label span {
  flex-grow: 1;
}

.swatch {
  appearance: none;
  width: var(--moz-input-color-swatch-size);
  height: var(--moz-input-color-swatch-size);
  background-color: #0000;
  border: none;
  cursor: pointer;
  padding: initial;
}

.swatch:focus-visible {
  outline: none;
}

.swatch::-moz-color-swatch {
  border-radius: var(--border-radius-circle);
  border: var(--border-width) solid var(--border-color-deemphasized);
  box-sizing: border-box;
}

.icon {color: var(--button-icon-fill);
}

`];
}
if (!customElements.get("moz-input-color")) { customElements.define("moz-input-color", MozInputColor); }
