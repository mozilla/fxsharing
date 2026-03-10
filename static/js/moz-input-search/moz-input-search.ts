/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import MozInputText from "../moz-input-text/moz-input-text";

/**
 * A search input custom element.
 *
 * @tagname moz-input-search
 *
 * @property {string} label - The text of the label element
 * @property {string} name - The name of the input control
 * @property {string} value - The value of the input control
 * @property {boolean} disabled - The disabled state of the input control
 * @property {string} description - The text for the description element that helps describe the input control
 * @property {string} supportPage - Name of the SUMO support page to link to.
 * @property {string} placeholder - Text to display when the input has no value.
 * @property {string} ariaLabel - The aria-label text when there is no visible label.
 * @property {string} ariaDescription - The aria-description text when there is no visible description.
 * @property {boolean} required - Is this input required
 * @property {string} pattern - Pattern for field validation
 */
export default class MozInputSearch extends MozInputText {
  // The amount of milliseconds that we wait before firing the "search" event.
  static #searchDebounceDelayMs = process.env.NODE_ENV === "test" ? 0 : 500;

  #searchTimer: null | ReturnType<typeof setTimeout> = null;

  #clearSearchTimer() {
    if (this.#searchTimer) {
      clearTimeout(this.#searchTimer);
    }
    this.#searchTimer = null;
  }

  #dispatchSearch() {
    this.dispatchEvent(
      new CustomEvent("MozInputSearch:search", {
        bubbles: true,
        composed: true,
        detail: { query: this.value },
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#clearSearchTimer();
  }

  handleInput(e: Event & { target: HTMLInputElement }) {
    super.handleInput(e);
    this.#clearSearchTimer();
    this.#searchTimer = setTimeout(() => {
      this.#dispatchSearch();
    }, MozInputSearch.#searchDebounceDelayMs);
  }

  // Clears the value and synchronously dispatches a search event if needed.
  clear() {
    this.#clearSearchTimer();
    if (this.value) {
      this.value = this.inputEl.value = "";
      this.#dispatchSearch();
    }
  }

  #hasIcon() {
    // If unspecified, search inputs still have a default search icon.
    return this.iconSrc === undefined || !!this.iconSrc;
  }

  inputTemplate() {
    return html`
      <input
        id="input"
        class=${this.#hasIcon() ? "with-icon" : ""}
        type="search"
        name=${this.name}
        ?disabled=${this.disabled || this.parentDisabled}
        ?required=${this.required}
        pattern=${ifDefined(this.pattern)}
        .value=${this.value}
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
}
customElements.define("moz-input-search", MozInputSearch);

declare global {
  interface HTMLElementTagNameMap {
    "moz-input-search": MozInputSearch;
  }
}
