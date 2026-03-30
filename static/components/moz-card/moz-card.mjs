/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, when, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
import "../../dependencies/acorn-icon.mjs";
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
 * @property {string} heading - The heading text that will be used for the card.
 * @property {string} iconSrc - Path to the icon that should be displayed in the card.
 * @property {string} type - (optional) The type of card. No type specified
 *   will be the default card. The other available type is "accordion"
 * @property {boolean} expanded - A flag to indicate whether the card is
 *  expanded or not. Can be used to expand the content section of the
 *  accordion card on initial render.
 * @slot content - The content to show inside of the card.
 */
export default class MozCard extends MozLitElement {
  static queries = {
    detailsEl: "#moz-card-details",
    headingEl: "#heading",
    contentEl: "#content",
    summaryEl: "summary",
    contentSlotEl: "#content-slot",
  };
  static properties = {
    heading: {
      type: String,
      fluent: true,
    },
    iconSrc: { type: String },
    type: {
      type: String,
      reflect: true,
    },
    expanded: { type: Boolean },
  };
  constructor() {
    super();
    this.type = "default";
    this.expanded = false;
  }
  headingTemplate() {
    if (!this.heading) {
      return "";
    }
    return html`
      <div id="heading-wrapper" part="moz-card-heading-wrapper">
        ${when(
          this.type == "accordion",
          () => html`<div class="chevron-icon"></div>`,
        )}
        ${when(
          !!this.iconSrc,
          () =>
            html`<acorn-icon
              id="heading-icon"
              src=${this.iconSrc}
              role="presentation"
            ></acorn-icon>`,
        )}
        <span id="heading" title=${ifDefined(this.heading)} part="heading"
          >${this.heading}</span
        >
      </div>
    `;
  }
  cardTemplate() {
    if (this.type === "accordion") {
      return html`
        <details
          id="moz-card-details"
          @toggle=${this.onToggle}
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
        <div id="content" part="content" aria-describedby="content">
          <slot></slot>
        </div>
      </div>
    `;
  }
  onToggle() {
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
        part="moz-card"
        aria-labelledby=${ifDefined(this.heading ? "heading" : undefined)}
      >
        ${this.cardTemplate()}
      </article>
    `;
  }
  static styles = [
    ...(MozLitElement.styles ?? []),
    css`
      /* From chrome://global/content/elements/moz-card.css */
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
        & summary {
          padding-block: var(--card-padding-block, var(--card-padding));
        }

        & #content {
          padding-block-end: var(--card-padding-block, var(--card-padding));
        }
      }

      :host(:not([type="accordion"])) {
        & .moz-card {
          padding-block: var(--card-padding-block, var(--card-padding));
        }

        & #moz-card-details {
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
      }

      #moz-card-details {
        width: 100%;
      }

      summary {
        cursor: pointer;
      }

      #heading-wrapper {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: var(--card-gap);
        padding-inline: var(--card-heading-padding-inline, var(--card-padding));
        border-radius: var(--card-border-radius);

        & .chevron-icon {
          -webkit-mask-image: var(
            --card-accordion-closed-icon,
            url("../../assets/arrow-down.svg")
          );

          mask-image: var(
            --card-accordion-closed-icon,
            url("../../assets/arrow-down.svg")
          );

          details[open] & {
            -webkit-mask-image: var(
              --card-accordion-open-icon,
              url("../../assets/arrow-up.svg")
            );

            mask-image: var(
              --card-accordion-open-icon,
              url("../../assets/arrow-up.svg")
            );
          }
        }

        & .chevron-icon {
          background-position: center;
          background-repeat: no-repeat;
        }

        & .chevron-icon,
        & #heading-icon {
          color: currentColor;
          width: var(--icon-size);
          height: var(--icon-size);
          min-width: var(--icon-size);
          min-height: var(--icon-size);
          padding: 0;
          flex-shrink: 0;
        }
      }

      #heading {
        font-size: var(--font-size-root);
        font-weight: var(--heading-font-weight);
      }

      #content {
        align-self: stretch;
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
        & > summary {
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
          & summary {
            border-end-start-radius: 0;
            border-end-end-radius: 0;
          }

          @media not (prefers-contrast) {
            & #content {
              padding-block-start: 0;
            }
          }
        }
      }
    `,
  ];
}
if (!customElements.get("moz-card")) {
  customElements.define("moz-card", MozCard);
}
