/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";
import { customElement } from "lit/decorators.js";
import { MozLitElement } from "lit-utils";
import "~/widgets/moz-button/moz-button";
import mozMessageBarCss from "./moz-message-bar.css";

import infoFilledIcon from "assets/icons/info-filled.svg";
import warningIcon from "assets/icons/warning.svg";
import checkFilledIcon from "assets/icons/check-filled.svg";
import errorIcon from "assets/icons/error.svg";

const messageTypeToIconData = {
  info: {
    iconSrc: infoFilledIcon,
    l10nId: "moz-message-bar-icon-info",
  },
  warning: {
    iconSrc: warningIcon,
    l10nId: "moz-message-bar-icon-warning",
  },
  success: {
    iconSrc: checkFilledIcon,
    l10nId: "moz-message-bar-icon-success",
  },
  error: {
    iconSrc: errorIcon,
    l10nId: "moz-message-bar-icon-error",
  },
  critical: {
    iconSrc: errorIcon,
    l10nId: "moz-message-bar-icon-error",
  },
};

/**
 * A simple message bar element that can be used to display
 * important information to users.
 *
 * @tagname moz-message-bar
 * @property {string} type - The type of the displayed message.
 * @property {string} heading - The heading of the message.
 * @property {string} message - The message text.
 * @property {boolean} dismissable - Whether or not the element is dismissable.
 * @property {string} messageL10nId - l10n ID for the message.
 * @property {string} messageL10nArgs - Any args needed for the message l10n ID.
 * @fires message-bar:close
 *  Custom event indicating that message bar was closed.
 * @fires message-bar:user-dismissed
 *  Custom event indicating that message bar was dismissed by the user.
 */

@customElement("moz-message-bar")
export default class MozMessageBar extends MozLitElement {
  static queries = {
    actionsSlot: "slot[name=actions]",
    actionsEl: ".actions",
    closeButton: "moz-button.close",
    messageEl: ".message",
    supportLinkSlot: "slot[name=support-link]",
  };

  static properties = {
    type: { type: String },
    heading: { type: String, fluent: true },
    message: { type: String, fluent: true },
    dismissable: { type: Boolean },
    messageL10nId: { type: String },
    messageL10nArgs: { type: String },
  };

  actionsSlot!: HTMLSlotElement;
  actionsEl!: HTMLElement;
  closeButton?: HTMLElement;
  messageEl!: HTMLElement;
  supportLinkSlot!: HTMLSlotElement;

  type: "info" | "warning" | "success" | "error" | "critical" = "info";
  heading = "";
  message = "";
  dismissable = false;
  messageL10nId?: string;
  messageL10nArgs?: string;

  constructor() {
    super();
  }

  handleActionSlotchange() {
    const actions = this.actionsSlot.assignedNodes();
    this.actionsEl.classList.toggle("active", actions.length > 0);
  }

  handleLinkSlotChange() {
    this.messageEl.classList.toggle(
      "has-link-after",
      !!this.supportLinkEls.length,
    );
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute("role", "alert");
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.dispatchEvent(new CustomEvent("message-bar:close"));
  }

  get supportLinkEls() {
    return this.supportLinkSlot.assignedElements();
  }

  iconTemplate() {
    const iconData = messageTypeToIconData[this.type];
    if (iconData) {
      const { iconSrc, l10nId } = iconData;
      return html`
        <div class="icon-container">
          <span
            class="contextual-icon icon"
            style=${styleMap({ "--icon-url": `url("${iconSrc}")` })}
            data-l10n-id=${l10nId}
            data-l10n-attrs="alt"
            role="presentation"
          ></span>
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

  closeButtonTemplate({ size }: { size?: "default" | "small" } = {}) {
    if (this.dismissable) {
      return html`
        <moz-button
          type="icon ghost"
          class="close"
          size=${ifDefined(size)}
          data-l10n-id="moz-message-bar-close-button"
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
                <span
                  class="message"
                  data-l10n-id=${ifDefined(this.messageL10nId)}
                  data-l10n-args=${ifDefined(this.messageL10nArgs)}
                >
                  ${this.message}
                </span>
                <span class="link">
                  <slot
                    name="support-link"
                    @slotchange=${this.handleLinkSlotChange}
                  ></slot>
                </span>
              </div>
            </div>
          </div>
          <span class="actions">
            <slot
              name="actions"
              @slotchange=${this.handleActionSlotchange}
            ></slot>
          </span>
        </div>
        ${this.closeButtonTemplate()}
      </div>
    `;
  }

  dismiss() {
    this.dispatchEvent(new CustomEvent("message-bar:user-dismissed"));
    this.close();
  }

  close() {
    this.remove();
  }

  static styles = [MozLitElement.styles, mozMessageBarCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-message-bar": MozMessageBar;
  }
}
