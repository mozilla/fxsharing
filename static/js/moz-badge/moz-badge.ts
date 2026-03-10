/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";
import { customElement } from "lit/decorators.js";
import { MozLitElement } from "lit-utils";
import mozBadgeCss from "./moz-badge.css";

/**
 * A simple badge element that can be used to indicate status or convey simple messages
 *
 * @tagname moz-badge
 * @property {string} label - Text to display on the badge
 * @property {string} iconSrc - The src for an optional icon shown next to the label
 * @property {string} title - The title of the badge, appears as a tooltip on hover
 */
@customElement("moz-badge")
export default class MozBadge extends MozLitElement {
  static properties = {
    label: { type: String, fluent: true },
    iconSrc: { type: String },
    /* eslint-disable-next-line lit/no-native-attributes */
    title: { type: String, fluent: true, mapped: true },
  };

  label = "";
  iconSrc?: string;

  render() {
    return html`
      <div class="moz-badge" title=${ifDefined(this.title)}>
        ${this.iconSrc
          ? html`<div
              class="moz-badge-icon contextual-icon"
              style=${styleMap({ "--icon-url": `url("${this.iconSrc}")` })}
              role="presentation"
            ></div>`
          : ""}
        <span class="moz-badge-label">${this.label}</span>
      </div>
    `;
  }

  static styles = [MozLitElement.styles, mozBadgeCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-badge": MozBadge;
  }
}
