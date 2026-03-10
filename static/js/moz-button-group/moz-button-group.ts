/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import type { PropertyValues } from "lit";
import { customElement } from "lit/decorators.js";
import { MozLitElement } from "lit-utils";
import mozButtonGroupCss from "./moz-button-group.css";

export const PLATFORM_LINUX = "linux";
export const PLATFORM_MACOS = "macosx";
export const PLATFORM_WINDOWS = "win";

/**
 * A grouping of buttons. Primary button order will be set automatically based
 * on class="primary", type="submit" or autofocus attribute. Set slot="primary"
 * on a primary button that does not have primary styling to set its position.
 *
 * @tagname moz-button-group
 * @property {string} platform - The detected platform, set automatically.
 */
@customElement("moz-button-group")
export default class MozButtonGroup extends MozLitElement {
  static queries = {
    defaultSlotEl: "slot:not([name])",
    primarySlotEl: "slot[name=primary]",
  };

  static properties = {
    platform: { state: true },
  };

  platform: string = "";

  declare defaultSlotEl: HTMLSlotElement;
  declare primarySlotEl: HTMLSlotElement;

  connectedCallback() {
    super.connectedCallback?.();
    this.#detectPlatform();
  }

  #detectPlatform() {
    if (navigator.platform.includes("Linux")) {
      this.platform = PLATFORM_LINUX;
    } else if (navigator.platform.includes("Mac")) {
      this.platform = PLATFORM_MACOS;
    } else {
      this.platform = PLATFORM_WINDOWS;
    }
  }

  handleSlotchange() {
    for (const child of this.defaultSlotEl.assignedNodes()) {
      if (!(child instanceof Element)) {
        // Text nodes won't support classList or getAttribute.
        continue;
      }
      switch (child.localName) {
        case "button":
          if (
            child.classList.contains("primary") ||
            child.getAttribute("type") == "submit" ||
            child.hasAttribute("autofocus") ||
            child.hasAttribute("default")
          ) {
            child.slot = "primary";
          }
          break;
        case "moz-button": {
          const type = child.getAttribute("type");
          if (type == "primary" || type == "destructive") {
            child.slot = "primary";
          }
          break;
        }
      }
    }
    this.#reorderLightDom();
  }

  #reorderLightDom() {
    const primarySlottedChildren = [...this.primarySlotEl.assignedNodes()];
    if (this.platform == PLATFORM_WINDOWS) {
      primarySlottedChildren.reverse();
      for (const child of primarySlottedChildren) {
        child.parentElement?.prepend(child);
      }
    } else {
      for (const child of primarySlottedChildren) {
        // Ensure the primary buttons are at the end of the light DOM.
        child.parentElement?.append(child);
      }
    }
  }

  updated(changedProperties: PropertyValues) {
    if (changedProperties.has("platform")) {
      this.#reorderLightDom();
    }
  }

  render() {
    let slots = [
      html` <slot @slotchange=${this.handleSlotchange}></slot> `,
      html` <slot name="primary"></slot> `,
    ];
    if (this.platform == PLATFORM_WINDOWS) {
      slots = [slots[1], slots[0]];
    }
    return html`${slots}`;
  }
  static styles = [MozLitElement.styles, mozButtonGroupCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-button-group": MozButtonGroup;
  }
}
