/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { literal, html as staticHtml } from "lit/static-html.js";
import { MozLitElement } from "lit-utils";
import type { MozBoxBase } from "lit-utils";

import mozBoxGroupCss from "./moz-box-group.css";

export const GROUP_TYPES = {
  list: "list",
  reorderable: "reorderable-list",
};

/**
 * An element used to group combinations of moz-box-item, moz-box-link, and
 * moz-box-button elements and provide the expected styles.
 *
 * @tagname moz-box-group
 * @property {string} type
 *   The type of the group, either "list", "reorderable-list", or undefined.
 *   Note that "reorderable-list" only works with moz-box-item elements for now.
 *   Import the moz-reorderable-list component if you need this type.
 * @slot default - Slot for rendering various moz-box-* elements.
 * @slot static - Slot for rendering non-reorderable moz-box-item elements.
 * @slot <index> - Slots used to assign moz-box-* elements to <li> elements when
 *   the group is type="list".
 * @slot <static-index>
 *   Slots used to render moz-box-item elements that are not intended to be reorderable
 *   when the group is type="reorderable-list".
 * @fires reorder
 *  Fired when items are reordered via drag-and-drop or keyboard shortcuts.
 *  The detail object contains draggedElement, targetElement, position, draggedIndex, and targetIndex.
 */
@customElement("moz-box-group")
export default class MozBoxGroup extends MozLitElement {
  #tabbable = true;
  listMutationObserver: MutationObserver;

  @property({ type: String })
  type?: string;

  @state()
  listItems: MozBoxBase[] = [];

  @state()
  staticItems: MozBoxBase[] = [];

  @query("moz-reorderable-list")
  reorderableList!: HTMLElementTagNameMap["moz-reorderable-list"];

  @query("slot[name='header']")
  headerSlot!: HTMLSlotElement;

  @query("slot[name='footer']")
  footerSlot!: HTMLSlotElement;

  constructor() {
    super();
    this.listMutationObserver = new MutationObserver(
      this.updateItems.bind(this),
    );
  }

  firstUpdated() {
    this.listMutationObserver.observe(this, {
      attributeFilter: ["hidden"],
      subtree: true,
      childList: true,
    });
    this.updateItems();
  }

  contentTemplate() {
    if (this.type == GROUP_TYPES.reorderable) {
      return html`<moz-reorderable-list
        class="scroll-container"
        itemselector="moz-box-item:not([static])"
        dragselector=".handle"
        @reorder=${this.handleReorder}
      >
        ${this.slotTemplate()}
      </moz-reorderable-list>`;
    }
    return this.slotTemplate();
  }

  slotTemplate() {
    const isReorderable = this.type == GROUP_TYPES.reorderable;
    if (this.type == GROUP_TYPES.list || isReorderable) {
      const listTag = isReorderable ? literal`ol` : literal`ul`;
      return staticHtml`<${listTag}
          tabindex="-1"
          class="list scroll-container"
          aria-orientation="vertical"
          @keydown=${this.handleKeydown}
          @focusin=${this.handleFocus}
          @focusout=${this.handleBlur}
        >
          ${this.listItems.map((_, i) => {
            return html`<li>
              <slot name=${i}></slot>
            </li> `;
          })}
          ${this.staticItems?.map((_, i) => {
            return html`<li>
              <slot name=${`static-${i}`}></slot>
            </li> `;
          })}
        </${listTag}>
        <slot hidden></slot>
        ${isReorderable ? html`<slot name="static" hidden></slot>` : ""}`;
    }
    return html`<div class="scroll-container" tabindex="-1">
      <slot></slot>
    </div>`;
  }

  /**
   * Handles reordering of items in the list.
   *
   * @param {object} event - Event object or wrapper containing detail from moz-reorderable-list.
   * @param {object} event.detail - Detail object from moz-reorderable-list.evaluateKeyDownEvent or drag-and-drop event.
   * @param {Element} event.detail.draggedElement - The element being reordered.
   * @param {Element} event.detail.targetElement - The target element to reorder relative to.
   * @param {number} event.detail.position - Position relative to target (-1 for before, 0 for after).
   * @param {number} event.detail.draggedIndex - The index of the element being reordered.
   * @param {number} event.detail.targetIndex - The new index of the draggedElement.
   */
  handleReorder(event: CustomEvent) {
    const { targetIndex } = event.detail;

    this.dispatchEvent(
      new CustomEvent("reorder", {
        bubbles: true,
        detail: event.detail,
      }),
    );

    /**
     * Without requesting an animation frame, we will lose focus within
     * the box group when using Ctrl + Shift + ArrowDown. The focus will
     * move to the browser chrome which is unexpected.
     *
     */
    requestAnimationFrame(() => {
      this.listItems[targetIndex]?.focus();
    });
  }

  handleKeydown(event: KeyboardEvent) {
    /* originalTarget isn't web-compatible.
    if (
      this.type == GROUP_TYPES.reorderable &&
      (event as any).originalTarget == (event.target as any).handleEl
    ) {
      const detail = this.reorderableList.evaluateKeyDownEvent(event);
      if (detail) {
        event.stopPropagation();
        this.handleReorder({ detail } as CustomEvent);
        return;
      }
    }
    */

    const positionElement = (event.target as Element).closest("[position]");
    if (!positionElement) {
      // If the user has clicked on the MozBoxGroup it may get keydown events
      // even if there is no focused element within it. Then the event target
      // will be the <ul> and we won't find an element with [position].
      return;
    }
    const positionAttr = positionElement.getAttribute("position");
    const currentPosition = parseInt(positionAttr!);

    const allItems = [...this.listItems, ...this.staticItems];

    switch (event.key) {
      case "Down":
      case "ArrowDown": {
        event.preventDefault();
        const nextItem = allItems[currentPosition + 1];
        nextItem?.focusOnKeyboardEvent(event);
        break;
      }
      case "Up":
      case "ArrowUp": {
        event.preventDefault();
        const prevItem = allItems[currentPosition - 1];
        prevItem?.focusOnKeyboardEvent(event);
        break;
      }
    }
  }

  handleFocus() {
    if (this.#tabbable) {
      this.#tabbable = false;
      const allItems = [...this.listItems, ...this.staticItems];
      allItems.forEach((item) => {
        item.setAttribute("tabindex", "-1");
      });
    }
  }

  handleBlur() {
    if (!this.#tabbable) {
      this.#tabbable = true;
      const allItems = [...this.listItems, ...this.staticItems];
      allItems.forEach((item) => {
        item.removeAttribute("tabindex");
      });
    }
  }

  updateItems() {
    const listItems: MozBoxBase[] = [];
    const staticItems: MozBoxBase[] = [];
    [...this.children].forEach((child) => {
      if (
        child.slot === "header" ||
        child.slot === "footer" ||
        (child as HTMLElement).hidden
      ) {
        return;
      }
      if (child.slot.includes("static")) {
        staticItems.push(child as MozBoxBase);
      } else {
        listItems.push(child as MozBoxBase);
      }
    });
    this.listItems = listItems;
    this.staticItems = staticItems;
  }

  render() {
    return html`
      <slot name="header"></slot>
      ${this.contentTemplate()}
      <slot name="footer"></slot>
    `;
  }

  updated(changedProperties: PropertyValues<this>) {
    const headerNode = this.headerSlot.assignedElements()[0];
    const footerNode = this.footerSlot.assignedElements().at(-1);
    headerNode?.classList.add("first");
    footerNode?.classList.add("last");

    if (changedProperties.has("listItems") && this.listItems.length) {
      this.listItems.forEach((item, i) => {
        if (
          this.type == GROUP_TYPES.list ||
          this.type == GROUP_TYPES.reorderable
        ) {
          item.slot = String(i);
          item.setAttribute("position", String(i));
        }
        item.classList.toggle("first", i == 0 && !headerNode);
        item.classList.toggle(
          "last",
          i == this.listItems.length - 1 &&
            !this.staticItems.length &&
            !footerNode,
        );
        item.removeAttribute("tabindex");
      });
      if (!this.#tabbable) {
        this.#tabbable = true;
      }
    }

    if (changedProperties.has("staticItems") && this.staticItems.length) {
      this.staticItems.forEach((item, i) => {
        item.slot = `static-${i}`;
        item.setAttribute("position", String(this.listItems.length + i));
        const staticEl = item.querySelector("moz-box-item") ?? item;
        staticEl.setAttribute("static", "");
        item.classList.toggle(
          "first",
          i == 0 && !this.listItems.length && !headerNode,
        );
        item.classList.toggle(
          "last",
          i == this.staticItems.length - 1 && !footerNode,
        );
        item.removeAttribute("tabindex");
      });
    }

    if (
      changedProperties.has("type") &&
      (this.type == GROUP_TYPES.list || this.type == GROUP_TYPES.reorderable)
    ) {
      this.updateItems();
    }
  }

  static styles = [MozLitElement.styles, mozBoxGroupCss];
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-box-group": MozBoxGroup;
  }
}
