/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, css } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { MozLitElement } from "lit-utils";

// Functions to wrap a string in a heading.
const HEADING_LEVEL_TEMPLATES: Record<
  number,
  (label: string) => ReturnType<typeof html>
> = {
  1: (label) => html`<h1>${label}</h1>`,
  2: (label) => html`<h2>${label}</h2>`,
  3: (label) => html`<h3>${label}</h3>`,
  4: (label) => html`<h4>${label}</h4>`,
  5: (label) => html`<h5>${label}</h5>`,
  6: (label) => html`<h6>${label}</h6>`,
};

/**
 * Fieldset wrapper to lay out form inputs consistently.
 *
 * @tagname moz-fieldset
 * @property {string} label - The label for the fieldset's legend.
 * @property {string} description - The description for the fieldset.
 * @property {number} headingLevel - Render the legend in a heading of this level.
 */
export default class MozFieldset extends MozLitElement {
  static properties = {
    label: { type: String, fluent: true },
    description: { type: String, fluent: true },
    ariaLabel: { type: String, fluent: true, mapped: true },
    ariaLabelledBy: { type: String, mapped: true },
    ariaOrientation: { type: String, mapped: true },
    headingLevel: { type: Number, reflect: true },
  };

  label?: string;
  description?: string;
  headingLevel = -1;

  constructor() {
    super();
  }

  descriptionTemplate() {
    if (this.description) {
      return html`<span id="description" class="description">
          ${this.description}
        </span>
        ${this.supportPageTemplate()}`;
    }
    return "";
  }

  supportPageTemplate() {
    return html`<slot name="support-link"></slot>`;
  }

  legendTemplate(labelString: string) {
    const label =
      HEADING_LEVEL_TEMPLATES[this.headingLevel]?.(labelString) || labelString;
    return html`<legend part="label">${label}</legend>`;
  }

  render() {
    return html`
      <fieldset
        aria-label=${ifDefined(this.ariaLabel)}
        .ariaLabelledByElements=${ifDefined(this.ariaLabelledByElements)}
        aria-describedby=${ifDefined(
          this.description ? "description" : undefined,
        )}
        aria-orientation=${ifDefined(this.ariaOrientation)}
      >
        ${this.label ? this.legendTemplate(this.label) : ""}
        ${!this.description ? this.supportPageTemplate() : ""}
        ${this.descriptionTemplate()}
        <div id="inputs" part="inputs">
          <slot></slot>
        </div>
      </fieldset>
    `;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        display: block;
        --input-gap: var(--space-large);
      }

      fieldset {
        display: contents;
      }

      legend {
        padding: 0;
        font-weight: var(--font-weight-bold);
        display: inline-block;

        &:has(+ #description) {
          display: block;
        }
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        margin: 0;
      }

      #description {
        margin: 0;
        margin-block-start: var(--space-xxsmall);
        color: var(--text-color-deemphasized);

        & + a,
        & + ::slotted([slot="support-link"]) {
          font-size: var(--font-size-small);
        }
      }

      #inputs {
        display: flex;
        flex-direction: column;
        gap: var(--input-gap);

        fieldset[aria-orientation="horizontal"] & {
          flex-direction: row;
          flex-wrap: wrap;
          row-gap: var(--space-small);
          column-gap: var(--space-medium);
        }

        :is(legend, #description) ~ & {
          margin-top: var(--space-small);
        }
      }

      a[is="moz-support-link"],
      ::slotted([slot="support-link"]) {
        white-space: nowrap;
      }
    `,
  ];
}
customElements.define("moz-fieldset", MozFieldset);

declare global {
  interface HTMLElementTagNameMap {
    "moz-fieldset": MozFieldset;
  }
}
