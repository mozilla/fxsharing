/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { MozBoxBase } from "lit-utils";
import { GROUP_TYPES } from "../moz-box-group/moz-box-group";

const DIRECTION_RIGHT = "Right";
const DIRECTION_LEFT = "Left";

const NAVIGATION_DIRECTIONS = {
  LTR: {
    FORWARD: DIRECTION_RIGHT,
    BACKWARD: DIRECTION_LEFT,
  },
  RTL: {
    FORWARD: DIRECTION_LEFT,
    BACKWARD: DIRECTION_RIGHT,
  },
};

/**
 * A custom element used for highlighting important information and/or providing
 * context for specific settings.
 *
 * @tagname moz-box-item
 * @property {string} label - Label for the button.
 * @property {string} description - Descriptive text for the button.
 * @property {string} iconSrc - The src for an optional icon shown next to the label.
 * @property {"default"|"medium-icon"|"large-icon"} layout - Layout style for the box content.
 * @slot default - Slot for the box item's content, which overrides label and description.
 * @slot actions - Slot for the actions positioned at the end of the component container.
 * @slot actions-start - Slot for the actions positioned at the start of the component container.
 */
@customElement("moz-box-item")
export default class MozBoxItem extends MozBoxBase {
  #actionEls: Element[] = [];

  @property({ type: String, reflect: true })
  layout = "default";

  @property({ type: String, attribute: "support-page" })
  supportPage = "";

  @query("slot:not([name])")
  defaultSlotEl!: HTMLSlotElement;

  @query("slot[name=actions-start]")
  actionsStartSlotEl!: HTMLSlotElement;

  @query("slot[name=actions]")
  actionsSlotEl!: HTMLSlotElement;

  @query(".handle")
  handleEl!: HTMLElement;

  constructor() {
    super();
    this.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  firstUpdated() {
    this.getActionEls();
  }

  handleKeydown(event: KeyboardEvent) {
    // Can't do originalTarget on the web
    const isHandleEvent = /* (event as any).originalTarget === this.handleEl; */ false;

    if (
      !isHandleEvent &&
      (event.target as HTMLElement)?.slot !== "actions" &&
      (event.target as HTMLElement)?.slot !== "actions-start"
    ) {
      return;
    }

    const target: Element = /* isHandleEvent
      ? (event as any).originalTarget
      : */ event.target as Element;

    const directions = this.getNavigationDirections();
    switch (event.key) {
      case directions.FORWARD:
      case `Arrow${directions.FORWARD}`: {
        const nextIndex = this.#actionEls.indexOf(target) + 1;
        const nextEl = this.#actionEls[nextIndex] as HTMLElement;
        nextEl?.focus();
        break;
      }
      case directions.BACKWARD:
      case `Arrow${directions.BACKWARD}`: {
        const prevIndex = this.#actionEls.indexOf(target) - 1;
        const prevEl = this.#actionEls[prevIndex] as HTMLElement;
        prevEl?.focus();
        break;
      }
    }
  }

  getNavigationDirections() {
    if (this.isDocumentRTL) {
      return NAVIGATION_DIRECTIONS.RTL;
    }
    return NAVIGATION_DIRECTIONS.LTR;
  }

  get isDocumentRTL() {
    return document.dir === "rtl";
  }

  get isDraggable() {
    const reorderableParent = this.closest(
      "moz-box-group",
    ) as HTMLElementTagNameMap["moz-box-group"];
    return (
      reorderableParent?.type == GROUP_TYPES.reorderable &&
      this.slot != "header" &&
      this.slot != "footer" &&
      !this.slot.includes("static")
    );
  }

  override focus() {
    this.focusOnKeyboardEvent();
  }

  override focusOnKeyboardEvent(event?: KeyboardEvent) {
    if (event?.key == "Up" || event?.key == "ArrowUp") {
      const actionEls = this.actionsSlotEl.assignedElements();
      const lastActions = actionEls.length
        ? actionEls
        : this.actionsStartSlotEl?.assignedElements();
      const lastAction = (lastActions?.[lastActions.length - 1] ??
        this.handleEl) as HTMLElement;
      lastAction?.focus();
    } else {
      const firstAction =
        this.handleEl ??
        this.actionsStartSlotEl?.assignedElements()?.[0] ??
        this.actionsSlotEl.assignedElements()?.[0];
      firstAction?.focus();
    }
  }

  getActionEls() {
    const handleEl = this.handleEl ? [this.handleEl] : [];
    const startActions = this.actionsStartSlotEl?.assignedElements() ?? [];
    const endActions = this.actionsSlotEl.assignedElements();
    this.#actionEls = [...handleEl, ...startActions, ...endActions];
  }

  slotTemplate(name: string) {
    return html`
      <span
        role="group"
        aria-labelledby="label"
        aria-describedby="description"
        class="actions"
        @slotchange=${this.getActionEls}
      >
        <slot name=${name}></slot>
      </span>
    `;
  }

  override textTemplate() {
    if (this.supportPage && this.supportPage !== "") {
      return this.supportTextTemplate();
    }
    return super.textTemplate();
  }

  supportTextTemplate() {
    return html`<div
      class=${classMap({
        "text-content": true,
        "has-icon": !!this.iconSrc,
        "has-description": !!this.description,
        "has-support-page": !!this.supportPage,
      })}
    >
      <span class="label-wrapper">
        ${this.iconTemplate()}<span>
          ${this.labelTemplate()}${!this.description
            ? this.supportPageTemplate()
            : ""}
        </span>
      </span>
      <span class="description-wrapper">
        ${this.descriptionTemplate()}${this.description
          ? this.supportPageTemplate()
          : ""}
      </span>
    </div>`;
  }

  supportPageTemplate() {
    if (this.supportPage) {
      return html`<a
        class="support-page"
        is="moz-support-link"
        support-page=${this.supportPage}
        part="support-link"
        aria-describedby=${this.description ? "description" : "label"}
      ></a>`;
    }
    return "";
  }

  render() {
    return html`
      <div class="box-container">
        ${this.isDraggable
          ? html`<span tabindex="0" class="handle"></span>`
          : ""}
        ${this.slotTemplate("actions-start")}
        <div class="box-content">
          ${this.label ? this.textTemplate() : html`<slot></slot>`}
        </div>
        ${this.slotTemplate("actions")}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-box-item": MozBoxItem;
  }
}
