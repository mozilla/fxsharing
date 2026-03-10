/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, css, unsafeCSS, nothing } from "lit";
import {
  html as literalHtml,
  literal,
  type StaticValue,
} from "lit/static-html.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { styleMap } from "lit/directives/style-map.js";
import { MozLitElement } from "lit-utils";

import arrowUpIcon from "assets/icons/arrow-up.svg";
import arrowDownIcon from "assets/icons/arrow-down.svg";

const HEADING_LEVEL_TO_TAG: Record<number, StaticValue> = {
  1: literal`h1`,
  2: literal`h2`,
  3: literal`h3`,
  4: literal`h4`,
  5: literal`h5`,
  6: literal`h6`,
};

/**
 * Cards contain content and actions about a single subject.
 * There are two card types:
 * The default type where no type attribute is required and the card
 * will have no extra functionality.
 *
 * The "accordion" type will initially not show any content. The card
 * will contain an arrow to expand the card so that all of the content
 * is visible. You can use the "expanded" attribute to force the accordion
 * card to show its content on initial render.
 *
 *
 * @property {string} heading - The heading text that will be used for the card.
 * @property {number} headingLevel - If present, a header html element will be used, with this level.
 * @property {string} iconSrc - Path to the icon that should be displayed in the card.
 * @property {string} type - (optional) The type of card. No type specified
 *   will be the default card. The other available type is "accordion"
 * @property {boolean} expanded - A flag to indicate whether the card is
 *  expanded or not. Can be used to expand the content section of the
 *  accordion card on initial render.
 * @slot content - The content to show inside of the card.
 * @slot heading-extra - Content to be added to the title part of the moz-card
 */
export default class MozCard extends MozLitElement {
  static queries = {
    detailsEl: "#moz-card-details",
    headingEl: "#heading",
    contentEl: "#content",
    summaryEl: "summary",
    contentSlotEl: "#content-slot",
  };

  declare detailsEl: HTMLDetailsElement;
  declare headingEl: HTMLElement;
  declare contentEL: HTMLElement;
  declare summaryEl: HTMLElement;
  declare contentSlotEl: HTMLSlotElement;

  static properties = {
    heading: { type: String, fluent: true },
    headingLevel: { type: Number },
    iconSrc: { type: String },
    iconPosition: { type: String },
    type: { type: String, reflect: true },
    expanded: { type: Boolean },
    hasExtraHeading: { state: true },
  };

  heading?: string;
  headingLevel: number = -1;
  iconSrc?: string;
  type: "default" | "accordion" = "default";
  expanded = false;
  iconPosition: "end" | "start" = "start";
  hasExtraHeading = false;

  handleExtraSlotChange(e: Event & { target: HTMLSlotElement }) {
    this.hasExtraHeading = Boolean(e.target.assignedElements().length);
  }

  iconTemplate(position: "start" | "end") {
    if (!this.iconSrc || this.iconPosition !== position) {
      return nothing;
    }

    return html`<div
      id="heading-icon"
      class="contextual-icon"
      style=${styleMap({ "--icon-url": `url("${this.iconSrc}")` })}
      role="presentation"
    ></div>`;
  }

  headingTemplate() {
    if (!this.heading) {
      return "";
    }

    const headingTag = HEADING_LEVEL_TO_TAG[this.headingLevel] ?? literal`span`;

    return html`
      <div id="heading-wrapper" part="moz-card-heading-wrapper">
        <div class="heading-main-part" role="presentation">
          <div class="heading-left-part" role="presentation">
            ${when(
              this.type == "accordion",
              () => html`<div class="chevron-icon contextual-icon"></div>`,
            )}
            ${this.iconTemplate("start")}
            ${literalHtml`<${headingTag} id="heading" title=${ifDefined(this.heading)} part="heading"
          >${this.heading}</${headingTag}>`}
          </div>
          ${this.iconTemplate("end")}
        </div>
        <span
          class="heading-right-part"
          role="presentation"
          ?hidden=${!this.hasExtraHeading}
        >
          <slot
            name="heading-extra"
            @slotchange=${this.handleExtraSlotChange}
          ></slot
        ></span>
      </div>
    `;
  }

  cardTemplate() {
    if (this.type === "accordion") {
      return html`
        <details
          id="moz-card-details"
          @toggle=${this.handleToggle}
          ?open=${this.expanded}
        >
          <summary part="summary">${this.headingTemplate()}</summary>
          <div id="content"><slot id="content-slot"></slot></div>
        </details>
      `;
    }

    return html`
      <div id="moz-card-details">
        ${this.headingTemplate()}
        <div id="content" aria-describedby="content">
          <slot></slot>
        </div>
      </div>
    `;
  }

  handleToggle() {
    this.expanded = this.detailsEl.open;
    this.dispatchEvent(
      new ToggleEvent("toggle", {
        newState: this.detailsEl.open ? "open" : "closed",
        oldState: this.detailsEl.open ? "closed" : "open",
      }),
    );
  }

  render() {
    return html`
      <article
        class="moz-card"
        aria-labelledby=${ifDefined(this.heading ? "heading" : undefined)}
      >
        ${this.cardTemplate()}
      </article>
    `;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        --card-border-radius: var(--border-radius-medium);
        --card-border-width: var(--border-width);
        --card-border: var(--card-border-width) solid var(--border-color-card);
        --card-background-color: var(--background-color-box);
        --card-focus-outline: var(--focus-outline);
        --card-box-shadow: var(--box-shadow-card);
        --card-padding: var(--space-large);
        --card-gap: var(--card-padding);
        --card-article-gap: var(--space-small);
      }

      :host {
        display: block;
        border: var(--card-border);
        border-radius: var(--card-border-radius);
        background-color: var(--card-background-color);
        box-shadow: var(--card-box-shadow);
        box-sizing: border-box;
      }

      :host([type="accordion"]) {
        summary {
          padding-block: var(--card-padding-block, var(--card-padding));
        }
        #content {
          padding-block-end: var(--card-padding-block, var(--card-padding));
        }
      }
      :host(:not([type="accordion"])) {
        .moz-card {
          padding-block: var(--card-padding-block, var(--card-padding));
        }
        #moz-card-details {
          display: flex;
          flex-direction: column;
          gap: var(--card-article-gap);
        }
      }

      .moz-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--card-article-gap);
        height: 100%;
        box-sizing: border-box;
      }

      #moz-card-details {
        width: 100%;
        flex: 1;
      }

      summary {
        cursor: pointer;
      }

      #heading-wrapper {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--card-gap);
        padding-inline: var(--card-heading-padding-inline, var(--card-padding));
        border-radius: var(--card-border-radius);
        flex-wrap: wrap;

        .chevron-icon {
          --icon-url: var(
            --card-accordion-closed-icon,
            url("${unsafeCSS(arrowDownIcon)}")
          );

          details[open] & {
            --icon-url: var(
              --card-accordion-open-icon,
              url("${unsafeCSS(arrowUpIcon)}")
            );
          }
        }

        .heading-main-part {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--card-gap);
          flex: 1;
        }

        .heading-left-part,
        .heading-right-part {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: var(--card-gap);
        }

        .chevron-icon,
        #heading-icon {
          width: var(--icon-size);
          height: var(--icon-size);
          min-width: var(--icon-size);
          min-height: var(--icon-size);
          padding: 0;
          flex-shrink: 0;
        }
      }

      span#heading {
        font-size: var(--font-size-root);
        font-weight: var(--font-weight-bold);
      }

      #heading {
        /* Cancel any margin that could come with the header elements */
        margin: 0;
      }

      #content {
        align-self: stretch;
        flex: 1;
        padding-inline: var(--card-padding-inline, var(--card-padding));
        border-end-start-radius: var(--card-border-radius);
        border-end-end-radius: var(--card-border-radius);

        @media (prefers-contrast) {
          :host([type="accordion"]) & {
            border-block-start: 0;
            padding-block-start: var(--card-padding-block, var(--card-padding));
          }
        }
      }

      details {
        > summary {
          list-style: none;
          border-radius: var(--card-border-radius);
          cursor: pointer;

          &:hover {
            background-color: var(--button-background-color-hover);
          }

          &:focus-visible {
            outline: var(--card-focus-outline);
          }

          @media (prefers-contrast) {
            outline: var(--button-border-color) solid var(--border-width);
          }

          @media (forced-colors) {
            color: var(--button-text-color);
            background-color: var(--button-background-color);

            &:hover {
              background-color: var(--button-background-color-hover);
              color: var(--button-text-color-hover);
            }

            &:active {
              background-color: var(--button-background-color-active);
              color: var(--button-text-color-active);
            }
          }
        }

        &[open] {
          summary {
            border-end-start-radius: 0;
            border-end-end-radius: 0;
          }
          @media not (prefers-contrast) {
            #content {
              /*
             There is a border shown above this element in prefers-contrast.
             When there isn't a border, there's no need for the extra space.
           */
              padding-block-start: 0;
            }
          }
        }
      }
    `,
  ];
}
customElements.define("moz-card", MozCard);
