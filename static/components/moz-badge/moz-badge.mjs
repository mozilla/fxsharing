/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* A simple badge element that can be used to indicate status or convey simple messages
*
* @tagname moz-badge
* @property {string} label - Text to display on the badge
* @property {string} iconSrc - The src for an optional icon shown next to the label
* @property {string} title - The title of the badge, appears as a tooltip on hover
* @property {string} type - The type of badge (e.g., "new")
*/
export default class MozBadge extends MozLitElement {
  static properties = {
    label: {
      type: String,
      fluent: true
    },
    iconSrc: { type: String },
    title: {
      type: String,
      fluent: true,
      mapped: true
    },
    type: {
      type: String,
      reflect: true
    }
  };
  constructor() {
    super();
    this.label = "";
  }
  render() {
    return html`
      <div class="moz-badge" title=${ifDefined(this.title)}>
        ${this.iconSrc ? html`<acorn-icon class="moz-badge-icon" src=${this.iconSrc} role="presentation"></acorn-icon>` : ""}
        <span class="moz-badge-label">${this.label}</span>
      </div>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-badge.css */
.moz-badge {
  display: flex;
  align-items: center;
  gap: var(--space-xsmall);
  padding: var(--space-xsmall) var(--space-small);
  width: fit-content;
  color: var(--badge-text-color);
  border: 1px solid var(--badge-border-color);
  border-radius: var(--border-radius-small);
}

.moz-badge-icon {
  width: var(--icon-size-xsmall);
  height: var(--icon-size-xsmall);
color: var(--icon-color);
}

.moz-badge-label {
  font-size: var(--font-size-small);
}

:host([type="new"]) {
  & .moz-badge {
    color: var(--badge-text-color-filled);
    background-color: var(--badge-background-color-filled);
    border-color: var(--badge-border-color-filled);
  }
}

`];
}
if (!customElements.get("moz-badge")) { customElements.define("moz-badge", MozBadge); }
