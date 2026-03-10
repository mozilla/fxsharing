/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import type { PropertyValues } from "lit";
import { query } from "lit/decorators.js";
import { customElement } from "lit/decorators.js";
import { MozLitElement } from "lit-utils";
import mozReorderableListCss from "./moz-reorderable-list.css";

const REORDER_EVENT = "reorder";
const DRAGSTART_EVENT = "dragstarted";
const DRAGEND_EVENT = "dragended";
const REORDER_PROP = "__mozReorderableIndex";

declare global {
  interface HTMLElement {
    [REORDER_PROP]: number;
  }
}

/**
 * A wrapper element that allows its children to be reordered by dragging and
 * dropping. The element emits the custom `reorder` event when an item is
 * dropped in a new position, which you can use to perform the actual
 * reordering.
 *
 * The detail object of the `reorder` event contains the following properties:
 *
 * - `draggedElement`: The element that was dragged.
 * - `targetElement`: The element over which the dragged element was dropped.
 * - `position`: The position of the drop relative to the target element. -1
 *   means before, 0 means after.
 *
 * Which children are reorderable is determined by the `itemSelector` property.
 *
 * Things to keep in mind when using this element:
 *
 * - Preserve the focus when reordering items.
 * - Check that the reordering shortcuts are not in conflict with other
 *   shortcuts.
 * - Make sure that reordering is picked up by screen readers. Usually DOM
 *   updates cause the reordered element to be read out again, which is
 *   sufficient.
 *
 * @tagname moz-reorderable-list
 * @property {string} itemSelector
 *   Selector for elements that should be reorderable.
 * @property {string} dragSelector
 *   Selector used when only part of the reorderable element should be draggable,
 *   e.g. we use a button or an icon as a "handle" to drag the element.
 * @fires reorder - Fired when an item is dropped in a new position.
 * @fires dragstarted - Fired when an item is dragged.
 * @fires dragended - Fired when an item is dropped.
 */
@customElement("moz-reorderable-list")
export default class MozReorderableList extends MozLitElement {
  static properties = {
    itemSelector: { type: String },
    dragSelector: { type: String },
  };

  @query("slot")
  slotEl!: HTMLSlotElement;

  @query(".indicator")
  indicatorEl!: HTMLElement;

  itemSelector = "li";
  dragSelector?: string;

  #draggedElement: HTMLElement | null = null;
  #dropTargetInfo: {
    targetElement: HTMLElement;
    targetIndex: number;
    position: number;
  } | null = null;
  #mutationObserver: MutationObserver;
  #items: HTMLElement[] = [];

  getBounds(element: Element): DOMRect {
    return element.getBoundingClientRect();
  }

  constructor() {
    super();
    this.addEventListener("dragstart", this.handleDragStart);
    this.addEventListener("dragover", this.handleDragOver);
    this.addEventListener("dragleave", this.handleDragLeave);
    this.addEventListener("dragend", this.handleDragEnd);
    this.addEventListener("drop", this.handleDrop);
    this.#mutationObserver = new MutationObserver((mutations) =>
      this.handleMutation(mutations),
    );
  }

  firstUpdated(changedProperties: PropertyValues<this>): void {
    super.firstUpdated?.(changedProperties);
    this.getItems();
  }

  connectedCallback(): void {
    super.connectedCallback?.();
    this.#mutationObserver.observe(this, {
      childList: true,
      subtree: true,
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback?.();
    this.#mutationObserver.disconnect();
  }

  handleMutation(mutationList: MutationRecord[]): void {
    let needsUpdate = false;

    for (const mutation of mutationList) {
      if (mutation.addedNodes.length || mutation.removedNodes.length) {
        needsUpdate = true;
        break;
      }
    }

    if (needsUpdate) {
      // Defer re-querying for items until the next paint to ensure any
      // asynchronously rendered (i.e. Lit-based) elements are in the DOM.
      requestAnimationFrame(() => {
        this.getItems();
      });
    }
  }

  /**
   * Add the draggable attribute non-XUL elements.
   */
  addDraggableAttribute(items: HTMLElement[]): void {
    let draggableItems = items;
    if (this.dragSelector) {
      draggableItems = this.getAssignedElementsBySelector(
        this.dragSelector,
        items,
      );
    }
    for (const item of draggableItems) {
      // Unlike XUL elements, HTML elements are not draggable by default.
      // So we need to set the draggable attribute on all items that match the selector.
      item.draggable = true;
    }
  }

  handleDragStart(event: DragEvent): void {
    const draggedElement = this.getTargetItemFromEvent(event);
    if (!draggedElement) {
      return;
    }

    const dragIndex = this.getItemIndex(draggedElement);
    if (dragIndex === -1) {
      return;
    }

    event.stopPropagation();

    this.emitEvent(DRAGSTART_EVENT, {
      draggedElement,
    });

    this.#draggedElement = draggedElement;
  }

  handleDragOver(event: DragEvent): void {
    this.#dropTargetInfo = this.getDropTargetInfo(event);
    if (!this.#dropTargetInfo) {
      this.indicatorEl.hidden = true;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const { targetIndex, position } = this.#dropTargetInfo;
    const items = this.#items;
    const item = items[targetIndex];

    if (!item) {
      this.indicatorEl.hidden = true;
      return;
    }

    const containerRect = this.getBounds(this);
    const itemRect = this.getBounds(item);

    this.indicatorEl.hidden = false;
    if (position < 0) {
      this.indicatorEl.style.top = `${itemRect.top - containerRect.top}px`;
    } else {
      this.indicatorEl.style.top = `${itemRect.bottom - containerRect.top}px`;
    }
  }

  handleDragLeave(event: DragEvent): void {
    const path = event.composedPath();
    const draggedEl = path.find((el) =>
      (el as Element).matches?.(this.itemSelector),
    );
    if (!draggedEl) {
      return;
    }
    let target = event.relatedTarget as Node | null;
    while (target && target !== this) {
      target = target.parentNode;
    }
    if (target !== this) {
      this.indicatorEl.hidden = true;
    }
  }

  handleDrop(event: DragEvent): void {
    this.#dropTargetInfo = this.getDropTargetInfo(event);
    if (!this.#draggedElement || !this.#dropTargetInfo) {
      return;
    }

    // Don't emit the reorder event if the dragged element is dropped on itself
    if (this.#draggedElement === this.#dropTargetInfo.targetElement) {
      this.handleDragEnd();
      return;
    }

    // Don't emit the reorder event if inserting after the previous element
    // or before the next element (no actual reordering needed)
    const draggedIndex = this.getItemIndex(this.#draggedElement);
    const targetIndex = this.#dropTargetInfo.targetIndex;
    const position = this.#dropTargetInfo.position;

    if (
      (position === 0 && targetIndex === draggedIndex - 1) || // Inserting after previous element
      (position === -1 && targetIndex === draggedIndex + 1) // Inserting before next element
    ) {
      this.handleDragEnd();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.emitEvent(REORDER_EVENT, {
      draggedElement: this.#draggedElement,
      targetElement: this.#dropTargetInfo.targetElement,
      position: this.#dropTargetInfo.position,
      draggedIndex,
      targetIndex,
    });
    this.handleDragEnd();
  }

  handleDragEnd(): void {
    // Sometimes dragend is not fired when the element is dropped. To ensure that
    // we clean up, handleDragEnd is also called from handleDrop; so it might be called
    // multiple times.
    if (this.#draggedElement == null) {
      return;
    }
    this.emitEvent(DRAGEND_EVENT, {
      draggedElement: this.#draggedElement,
    });
    this.indicatorEl.hidden = true;
    this.#draggedElement = null;
  }

  evaluateKeyDownEvent(event: KeyboardEvent):
    | {
        draggedElement: HTMLElement;
        targetElement: HTMLElement;
        position: number;
        draggedIndex: number;
        targetIndex: number;
      }
    | undefined {
    const direction = isReorderKeyboardEvent(event);
    if (direction == 0) {
      return undefined;
    }
    const fromEl = this.getTargetItemFromEvent(event);
    if (!fromEl) {
      return undefined;
    }
    const fromIndex = this.getItemIndex(fromEl);
    if (fromIndex === -1) {
      return undefined;
    }

    // if index is 0 and direction is -1, or index is last and direction is 1, do nothing
    const items = this.#items;
    if (
      (fromIndex === 0 && direction === -1) ||
      (fromIndex === items.length - 1 && direction === 1)
    ) {
      return undefined;
    }

    return {
      draggedElement: fromEl,
      targetElement: items[fromIndex + direction],
      position: Math.min(direction, 0),
      draggedIndex: fromIndex,
      targetIndex: fromIndex + direction,
    };
  }

  /**
   * Creates a CustomEvent and dispatches it on the element.
   *
   * @param eventName The name of the event
   * @param detail The detail object to pass to the event
   */
  emitEvent(eventName: string, detail?: unknown): void {
    const customEvent = new CustomEvent(eventName, {
      detail,
    });
    this.dispatchEvent(customEvent);
  }

  /**
   * Returns all draggable items based on the itemSelector. Adds reorderable
   * indices and ensures elements are draggable.
   *
   * @see getAssignedElementsBySelector for parameters
   */
  getItems(): void {
    const items = this.getAssignedElementsBySelector(this.itemSelector);
    this.addDraggableAttribute(items);
    items.forEach((item, i) => {
      item[REORDER_PROP] = i;
    });
    this.#items = items;
  }

  /**
   * Returns all elements for the given selector, including the elements
   * themselves, matching the selector, regardless of nesting
   *
   * @param selector The selector to match
   * @param root The elements to start searching for items. Defaults to the slot.
   */
  getAssignedElementsBySelector(
    selector: string,
    root?: HTMLElement | HTMLElement[],
  ): HTMLElement[] {
    let rootElements: Element[];
    if (!root) {
      rootElements = this.slotEl.assignedElements();
    } else if (!Array.isArray(root)) {
      rootElements = [root];
    } else {
      rootElements = root;
    }

    const collectEls = (items: Element[]): HTMLElement[] => {
      return items.flatMap((item) => {
        if (item.matches(selector)) {
          return item as HTMLElement;
        }

        const nestedEls =
          item.shadowRoot?.querySelectorAll(selector) ??
          item.querySelectorAll(selector);
        if (nestedEls.length) {
          return [...nestedEls] as HTMLElement[];
        }

        const nextEls =
          item.localName == "slot"
            ? (item as HTMLSlotElement).assignedElements()
            : [...item.children];
        return collectEls(nextEls);
      });
    };

    return collectEls(rootElements);
  }

  /**
   * Returns the drop target based on the current mouse position relative to
   * the item it hovers over
   */
  getDropTargetInfo(event: DragEvent): {
    targetElement: HTMLElement;
    targetIndex: number;
    position: number;
  } | null {
    const targetItem = this.getTargetItemFromEvent(event);
    if (!targetItem) {
      return null;
    }

    const targetIndex = this.getItemIndex(targetItem);
    if (targetIndex === -1) {
      return null;
    }

    const rect = targetItem.getBoundingClientRect();

    const threshold = rect.height * 0.5;
    const position = event.clientY < rect.top + threshold ? -1 : 0;
    return {
      targetElement: targetItem,
      targetIndex,
      position,
    };
  }

  /**
   * Returns the index of the given item element out of all items within the
   * slot
   */
  getItemIndex(item: HTMLElement): number {
    return item[REORDER_PROP] ?? -1;
  }

  /**
   * Returns the item element that is the closest parent of the given event
   * target
   */
  getTargetItemFromEvent(event: Event): HTMLElement | null {
    const target = event.target as Element;
    const targetItem = target?.closest(this.itemSelector);
    return (targetItem as HTMLElement) || null;
  }

  render() {
    return html`
      <div class="indicator" hidden="" aria-hidden="true"></div>
      <slot @slotchange=${this.getItems}></slot>
    `;
  }

  static styles = [MozLitElement.styles, mozReorderableListCss];
}

/**
 * Checks if the given keyboard event is a reorder keyboard event
 * (ctrl+shift+up/down).
 *
 * Can be used instead of the automatic reorder keyboard event handling by the
 * moz-reorderable-list component.
 *
 * @param event - The keyboard event to check
 * @returns 0 if the event is not a reorder keyboard event, -1
 *   if the event is a reorder up event, 1 if the event is a reorder down
 *   event
 */
export function isReorderKeyboardEvent(event: KeyboardEvent): 0 | -1 | 1 {
  if (event.code != "ArrowUp" && event.code != "ArrowDown") {
    return 0;
  }
  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) {
    return 0;
  }
  return event.code == "ArrowUp" ? -1 : 1;
}

declare global {
  interface HTMLElementTagNameMap {
    "moz-reorderable-list": MozReorderableList;
  }
}
