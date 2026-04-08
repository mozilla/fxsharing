/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
/**
* A promotional callout element.
*
* @tagname moz-promo
* @property {string} type - The type of promo, can be either
*  "default" or "vibrant". Determines the colors of the promotional
*  element
* @property {string} heading - The heading of the promo element.
* @property {string} message - The message of the promo element.
* @property {string} imageSrc - The main image of the promo element.
* @property {string} imageAlignment - How the image should be aligned. Can be "start", "end", "center".
*/
export default class MozPromo extends MozLitElement {
  static queries = {
    actionsSlot: "slot[name=actions]",
    supportLinkSlot: "slot[name=support-link]",
    actionsSupportWrapper: ".actions-and-support-link-wrapper"
  };
  static properties = {
    type: {
      type: String,
      reflect: true
    },
    heading: {
      type: String,
      fluent: true
    },
    message: {
      type: String,
      fluent: true
    },
    imageSrc: {
      type: String,
      reflect: true
    },
    imageAlignment: {
      type: String,
      reflect: true
    }
  };
  constructor() {
    super();
    this.type = "default";
    this.imageAlignment = "start";
  }
  updated(changedProperties) {
    if (changedProperties.has("imageSrc") && this.imageSrc) {
      this.style.setProperty("--promo-image-url", `url("${this.imageSrc}")`);
    }
  }
  handleSlotChange() {
    let hasActions = this.actionsSlot.assignedNodes().length;
    let hasSupport = this.supportLinkSlot.assignedNodes().length;
    this.actionsSupportWrapper.classList.toggle("active", hasActions || hasSupport);
  }
  headingTemplate() {
    if (this.heading) {
      return html`<h2 class="heading heading-medium">${this.heading}</h2>`;
    }
    return "";
  }
  imageTemplate() {
    if (this.imageSrc) {
      return html` <div class="image-container"></div> `;
    }
    return "";
  }
  render() {
    let imageStartAligned = this.imageAlignment == "start";
    return html` <div class="container">
        ${imageStartAligned ? this.imageTemplate() : ""}
        <div class="text-container">
          ${this.headingTemplate()}
          <p class="message">
            ${this.message}<span class="actions-and-support-link-wrapper">
              <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
              <slot
                name="support-link"
                @slotchange=${this.handleSlotChange}
              ></slot>
            </span>
          </p>
        </div>
        ${!imageStartAligned ? this.imageTemplate() : ""}
      </div>`;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-promo.css */
@import "../../dependencies/text-and-typography.css";

:host([type="vibrant"]) {
  --promo-message-text-color: light-dark(var(--color-violet-80), var(--color-violet-0));
  --promo-heading-text-color: var(--promo-message-text-color);
  --promo-background-color: light-dark(var(--color-violet-0), var(--color-violet-90));
  --promo-border-color: var(--color-violet-30);
}

:host([imagealignment="center"]) {
  & .container {
    flex-direction: column;
  }

  & .image-container {
    min-height: var(--size-item-large);
    margin: var(--space-large);
    margin-block-start: 0;
  }
}

:host {
  --promo-message-text-color: var(--text-color);
  --promo-heading-text-color: var(--promo-message-text-color);
  --promo-border: var(--promo-border-width) solid var(--promo-border-color);
  --promo-border-color: var(--border-color);
  --promo-border-width: var(--border-width);
  --promo-border-radius: var(--border-radius-medium);

  @media (prefers-contrast) {
    --promo-message-text-color: var(--text-color);
  }
}

.container {
  background-color: var(--promo-background-color);
  border: var(--promo-border);
  border-radius: var(--promo-border-radius);
  color: var(--promo-message-text-color);
  display: flex;
  flex-direction: row;
  gap: var(--space-xsmall);
  min-height: 56px;
  align-items: center;
  overflow: hidden;
}

.text-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-xsmall);
  padding: var(--space-medium);
}

.image-container {
  background-image: var(--promo-image-url);
  background-size: cover;
  background-position: var(--promo-image-position, center);
  background-repeat: no-repeat;
  flex-basis: 25%;
  align-self: stretch;
}

.heading {
  color: var(--promo-heading-text-color);
  margin-block: 0;
}

.message {
  display: flex;
  flex-wrap: wrap;
  word-break: break-word;
  margin: 0;
  align-items: center;

  &:has(slot:has-slotted) {
    gap: var(--space-small);
  }
}

.actions-and-support-link-wrapper {
  display: none;
  gap: var(--space-small);
  align-items: baseline;
}

.actions-and-support-link-wrapper.active {
  display: flex;
}

`];
}
if (!customElements.get("moz-promo")) { customElements.define("moz-promo", MozPromo); }
