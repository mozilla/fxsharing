/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined, when, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "../moz-button/moz-button.mjs";
import "../../dependencies/acorn-icon.mjs";
const _l10nFallback = {
  "moz-message-bar-icon-error": "Error",
  "moz-message-bar-icon-info": "Info",
  "moz-message-bar-icon-success": "Success",
  "moz-message-bar-icon-warning": "Warning"
};
/**
* @typedef {"info" | "warning" | "success" | "error"} MozMessageBarType
*/
const messageTypeToIconData = {
  info: {
    iconSrc: new URL("../../assets/info-filled.svg", import.meta.url).href,
    l10nId: "moz-message-bar-icon-info"
  },
  warning: {
    iconSrc: new URL("../../assets/warning.svg", import.meta.url).href,
    l10nId: "moz-message-bar-icon-warning"
  },
  success: {
    iconSrc: new URL("../../assets/check-filled.svg", import.meta.url).href,
    l10nId: "moz-message-bar-icon-success"
  },
  error: {
    iconSrc: new URL("../../assets/error.svg", import.meta.url).href,
    l10nId: "moz-message-bar-icon-error"
  },
  critical: {
    iconSrc: new URL("../../assets/error.svg", import.meta.url).href,
    l10nId: "moz-message-bar-icon-error"
  }
};
/**
* A simple message bar element that can be used to display
* important information to users.
*
* @tagname moz-message-bar
* @fires message-bar:close
*  Custom event indicating that message bar was closed.
* @fires message-bar:user-dismissed
*  Custom event indicating that message bar was dismissed by the user.
*/
export default class MozMessageBar extends MozLitElement {
  static queries = {
    actionsSlot: "slot[name=actions]",
    actionsEl: ".actions",
    closeButton: "moz-button.close",
    messageEl: ".message",
    supportLinkSlot: "slot[name=support-link]",
    supportLinkHolder: ".link"
  };
  static properties = {
    type: { type: String },
    heading: {
      type: String,
      fluent: true
    },
    message: {
      type: String,
      fluent: true
    },
    dismissable: { type: Boolean },
    supportPage: { type: String },
    messageL10nId: { type: String },
    messageL10nArgs: { type: String }
  };
  constructor() {
    super();
    /**
    * The type of the displayed message.
    *
    * @type {MozMessageBarType}
    */
    this.type = "info";
    /**
    * Whether or not the element is dismissable.
    *
    * @type {boolean}
    */
    this.dismissable = false;
    /**
    * The message text.
    *
    * @type {string | undefined}
    */
    this.message = undefined;
    /**
    * l10n ID for the message.
    *
    * @type {string | undefined}
    */
    this.messageL10nId = undefined;
    /**
    * Any args needed for the message l10n ID.
    *
    * @type {Record<string, string> | undefined}
    */
    this.messageL10nArgs = undefined;
    /**
    * The heading of the message.
    *
    * @type {string | undefined}
    */
    this.heading = undefined;
    /**
    * The support page stub.
    *
    * @type {string | undefined}
    */
    this.supportPage = undefined;
  }
  onActionSlotchange() {
    let actions = this.actionsSlot.assignedNodes();
    this.actionsEl.classList.toggle("active", actions.length);
  }
  onLinkSlotChange() {
    this.messageEl.classList.toggle("has-link-after", !!this.supportLinkEls.length || !!this.supportPage);
  }
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("role", "alert");
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.dispatchEvent(new CustomEvent("message-bar:close"));
  }
  get supportLinkEls() {
    if (this.supportPage) {
      return this.supportLinkHolder.children;
    }
    return this.supportLinkSlot.assignedElements();
  }
  supportLinkTemplate() {
    if (this.supportPage) {
      return html`<a
        is="moz-support-link"
        support-page=${this.supportPage}
        part="support-link"
        aria-describedby="heading message"
      ></a>`;
    }
    return html`<slot
      name="support-link"
      @slotchange=${this.onLinkSlotChange}
    ></slot>`;
  }
  iconTemplate() {
    let iconData = messageTypeToIconData[this.type];
    if (iconData) {
      let { iconSrc, l10nId } = iconData;
      return html`
        <div class="icon-container">
          <acorn-icon
            class="icon"
            src=${iconSrc}
            data-l10n-id=${l10nId} alt=${_l10nFallback[l10nId] ?? ""}></acorn-icon>
        </div>
      `;
    }
    return "";
  }
  headingTemplate() {
    if (this.heading) {
      return html`<strong class="heading">${this.heading}</strong>`;
    }
    return "";
  }
  closeButtonTemplate({ size } = {}) {
    if (this.dismissable) {
      return html`
        <moz-button
          type="icon ghost"
          class="close"
          size=${ifDefined(size)}
          data-l10n-id="moz-message-bar-close-button" aria-label="Close" title="Close"
          @click=${this.dismiss}
        ></moz-button>
      `;
    }
    return "";
  }
  render() {
    return html`
      <div class="container">
        <div class="content">
          <div class="text-container">
            ${this.iconTemplate()}
            <div class="text-content">
              ${this.headingTemplate()}
              <div>
                <slot name="message">
                  <span
                    id="message"
                    class=${when(this.supportPage, () => "message has-link-after", () => "message")}
                    data-l10n-id=${ifDefined(this.messageL10nId)}
                    data-l10n-args=${ifDefined(JSON.stringify(this.messageL10nArgs))}
                  >
                    ${this.message}
                  </span>
                </slot>
                <span class="link"> ${this.supportLinkTemplate()} </span>
              </div>
            </div>
          </div>
          <span class="actions">
            <slot name="actions" @slotchange=${this.onActionSlotchange}></slot>
          </span>
        </div>
        ${this.closeButtonTemplate()}
      </div>
    `;
  }
  dismiss() {
    let event = new CustomEvent("message-bar:user-dismissed", {
      bubbles: true,
      cancelable: true
    });
    this.dispatchEvent(event);
    if (!event.defaultPrevented) {
      this.close();
    }
  }
  close() {
    this.remove();
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-message-bar.css */
:host {
  --message-bar-icon-color: var(--icon-color-information);
  --message-bar-icon-size: var(--size-item-small);
  --message-bar-icon-close-url: url("../../assets/close.svg");
  --message-bar-container-min-height: var(--size-item-large);
  --message-bar-border-color: oklch(from var(--message-bar-icon-color) l c h / 20%);
  --message-bar-border-radius: var(--border-radius-small);
  --message-bar-border-width: var(--border-width);
  --message-bar-text-color: var(--text-color);
  --message-bar-background-color: var(--background-color-information);
  background-color: var(--message-bar-background-color);
  border: var(--message-bar-border-width) solid var(--message-bar-border-color);
  border-radius: var(--message-bar-border-radius);
  color: var(--message-bar-text-color);
  text-align: start;
}

@media (prefers-contrast) {
  :host {
    --message-bar-border-color: var(--border-color);
  }
}

:host(:not([hidden])) {
  display: block;
}

.container {
  display: flex;
  gap: var(--space-small);
  min-height: var(--message-bar-container-min-height);
  padding-inline: var(--space-medium) var(--space-small);
  padding-block: var(--space-small);
}

.content {
  display: flex;
  flex-grow: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-small) var(--space-medium);
  margin-inline-start: var(--message-bar-icon-size);
}

.text-container {
  display: flex;
  gap: var(--space-xsmall) var(--space-small);
  padding-block: calc((var(--message-bar-container-min-height)  - 1lh) / 2);
}

.text-content {
  display: inline-flex;
  gap: var(--space-xsmall) var(--space-small);
  flex-wrap: wrap;
  word-break: break-word;
}

.icon-container {
  height: 1lh;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-inline-start: calc(-1 * var(--message-bar-icon-size));
}

.icon {
  width: var(--message-bar-icon-size);
  height: var(--message-bar-icon-size);
  flex-shrink: 0;
  appearance: none;
color: var(--message-bar-icon-color);
}

.heading {
  font-weight: var(--heading-font-weight);
}

.message.has-link-after {
  margin-inline-end: var(--space-xsmall);
}

.link {
  display: inline-block;
}

.link ::slotted(a) {
  margin-inline-end: var(--space-xsmall);
}

.actions {
  display: none;
}

.actions.active {
  display: inline-flex;
  gap: var(--space-small);
}

.actions ::slotted(button) {
  min-width: fit-content !important;
  margin: 0 !important;
  padding: var(--space-xsmall) var(--space-large) !important;
}

moz-button::part(button) {
  background-image: var(--message-bar-icon-close-url);
}

@media not (prefers-contrast) {
  :host([type="warning"]) {
    --message-bar-background-color: var(--background-color-warning);
    --message-bar-icon-color: var(--icon-color-warning);
  }

  :host([type="success"]) {
    --message-bar-background-color: var(--background-color-success);
    --message-bar-icon-color: var(--icon-color-success);
  }

  :host([type="error"]), :host([type="critical"]) {
    --message-bar-background-color: var(--background-color-critical);
    --message-bar-icon-color: var(--icon-color-critical);
  }
}

`];
}
if (!customElements.get("moz-message-bar")) { customElements.define("moz-message-bar", MozMessageBar); }
