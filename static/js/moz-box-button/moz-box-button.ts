/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";
import { MozBoxBase } from "lit-utils";
import mozBoxButtonCss from "./moz-box-button.css";

import arrowRightIcon from "assets/icons/arrow-right.svg";

/**
 * A button custom element used for navigating between sub-pages or opening
 * dialogs.
 *
 * @tagname moz-box-button
 * @property {string} label - Label for the button.
 * @property {string} description - Descriptive text for the button.
 * @property {string} iconSrc - The src for an optional icon shown next to the label.
 * @property {boolean} disabled - Whether or not the button is disabled.
 * @property {string} accesskey - Key used for keyboard access.
 * @property {boolean} parentDisabled - Disabled by the parent's state, see MozBaseInputElement.
 */
@customElement("moz-box-button")
export default class MozBoxButton extends MozBoxBase {
  static override shadowRootOptions = {
    ...MozBoxBase.shadowRootOptions,
    delegatesFocus: true,
  };

  @property({ type: Boolean })
  disabled = false;

  @property({ type: String, fluent: true, mapped: true })
  accessKey = "";

  @state()
  parentDisabled = false;

  @query("button")
  buttonEl!: HTMLButtonElement;

  @query(".nav-icon")
  navIcon!: HTMLImageElement;

  click() {
    this.buttonEl.click();
  }

  labelTemplate() {
    if (!this.label) {
      return "";
    }
    return html`<label
      is="moz-label"
      class="label"
      shownaccesskey=${ifDefined(this.accessKey)}
    >
      ${this.label}
    </label>`;
  }

  render() {
    return html`
      <button
        class="button"
        ?disabled=${this.disabled || this.parentDisabled}
        accesskey=${ifDefined(this.accessKey)}
      >
        ${super.textTemplate()}
        <div
          class="icon nav-icon contextual-icon"
          style=${styleMap({ "--icon-url": `url("${arrowRightIcon}")` })}
          role="presentation"
        ></div>
      </button>
    `;
  }

  static styles = [MozBoxBase.styles, mozBoxButtonCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-box-button": MozBoxButton;
  }
}
