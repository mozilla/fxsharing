/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html } from "lit";
import type { PropertyValues, PropertyDeclarations } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { MozLitElement } from "lit-utils";
import "./moz-fieldset/moz-fieldset";

const NAVIGATION_FORWARD = "forward";
const NAVIGATION_BACKWARD = "backward";

const NAVIGATION_VALUE = {
  [NAVIGATION_FORWARD]: 1,
  [NAVIGATION_BACKWARD]: -1,
};

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

interface SelectControlItem extends HTMLElement {
  value: string;
  checked: boolean;
  disabled: boolean;
  position: number;
  itemTabIndex: number;
  name: string;
  focus(): void;
  click(): void;
  requestUpdate(): void;
  updateComplete: Promise<boolean>;
}

/**
 * Class that can be extended to handle managing the selected and focus states
 * of child elements using a roving tabindex. For more information on this focus
 * management pattern, see:
 * https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex
 *
 * Child elements must use SelectControlItemMixin for behavior to work as
 * expected.
 */
export class SelectControlBaseElement extends MozLitElement {
  #childElements?: SelectControlItem[];
  #value?: string;
  #checkedIndex?: number;
  #focusedIndex?: number;

  type = "radio";
  disabled = false;
  description?: string;
  supportPage?: string;
  label?: string;
  name = "";
  headingLevel?: number;

  static childElementName: string;
  static orientation: string;

  declare ["constructor"]: typeof SelectControlBaseElement;

  static properties: PropertyDeclarations = {
    type: { type: String },
    disabled: { type: Boolean, reflect: true },
    description: { type: String, fluent: true },
    supportPage: { type: String, attribute: "support-page" },
    label: { type: String, fluent: true },
    name: { type: String },
    value: { type: String },
    headingLevel: { type: Number },
  };

  static queries = {
    fieldset: "moz-fieldset",
  };

  set value(newValue: string | undefined) {
    this.#value = newValue;
    this.childElements.forEach((item, index) => {
      const isChecked = this.value === item.value;
      item.checked = isChecked;
      if (isChecked && !item.disabled) {
        this.#checkedIndex = index;
      }
    });
    this.syncFocusState();
  }

  get value() {
    return this.#value;
  }

  get hasValue() {
    return Boolean(this.value);
  }

  set focusedIndex(newIndex: number | undefined) {
    if (this.#focusedIndex !== newIndex) {
      this.#focusedIndex = newIndex;
      this.syncFocusState();
    }
  }

  get checkedIndex() {
    return this.#checkedIndex;
  }

  set checkedIndex(newIndex: number | undefined) {
    if (this.#checkedIndex !== newIndex) {
      this.#checkedIndex = newIndex;
      this.syncFocusState();
    }
  }

  get focusableIndex() {
    const activeEl = (this.getRootNode() as ShadowRoot | HTMLDocument)
      .activeElement;
    const childElFocused =
      (activeEl as HTMLElement | null)?.localName ==
      this.constructor.childElementName;

    if (
      this.#checkedIndex != undefined &&
      this.#value &&
      (this.type == "radio" || !childElFocused)
    ) {
      return this.#checkedIndex;
    }

    if (
      this.#focusedIndex != undefined &&
      this.type === "listbox" &&
      childElFocused
    ) {
      return this.#focusedIndex;
    }

    return this.childElements.findIndex((item) => !item.disabled);
  }

  // Query for child elements the first time they are needed + ensure they
  // have been upgraded so we can access properties.
  get childElements(): SelectControlItem[] {
    if (!this.#childElements) {
      const primarySlot = this.shadowRoot?.querySelector(
        "slot:not([name])",
      ) as HTMLSlotElement | null;
      this.#childElements = (
        primarySlot?.assignedElements() || [...this.children]
      )?.filter(
        (el): el is SelectControlItem =>
          el.localName === this.constructor.childElementName && !el.slot,
      );
      this.#childElements.forEach((item) => customElements.upgrade(item));
    }
    return this.#childElements;
  }

  constructor() {
    super();
    this.addEventListener("blur", (e) => this.handleBlur(e), true);
    this.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  firstUpdated() {
    this.syncStateToChildElements();
  }

  async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await Promise.all(this.childElements.map((item) => item.updateComplete));
    return result;
  }

  syncStateToChildElements() {
    this.childElements.forEach((item, index) => {
      item.position = index;

      if (item.checked && this.value == undefined) {
        this.value = item.value;
      }

      if (this.value == item.value && !item.disabled) {
        this.#checkedIndex = item.position;
      }

      item.name = this.name;
    });
    this.syncFocusState();
  }

  syncFocusState() {
    const focusableIndex = this.focusableIndex;
    this.childElements.forEach((item, index) => {
      item.itemTabIndex = focusableIndex === index ? 0 : -1;
    });
  }

  handleBlur(event: FocusEvent) {
    if (this.contains(event.relatedTarget as Node)) {
      return;
    }
    this.focusedIndex = undefined;
  }

  // NB: We may need to revise this to avoid bugs when we add more focusable
  // elements to select control base/items.
  // Julien's note: using "Down"/"Right"/"Up"/"Left" (in addition to Arrow*)
  // supports very old versions of Firefox and Edge, we might want to change
  // this.
  // Julien's note: also the native radio buttons already seem to support this
  // natively, do we need special code to handle it? Might be for RTL support...
  handleKeydown(event: KeyboardEvent) {
    const directions = this.getNavigationDirections();
    switch (event.key) {
      case "Down":
      case "ArrowDown":
      case directions.FORWARD:
      case `Arrow${directions.FORWARD}`: {
        event.preventDefault();
        this.navigate(NAVIGATION_FORWARD);
        break;
      }
      case "Up":
      case "ArrowUp":
      case directions.BACKWARD:
      case `Arrow${directions.BACKWARD}`: {
        event.preventDefault();
        this.navigate(NAVIGATION_BACKWARD);
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

  navigate(direction: string) {
    const currentIndex = this.focusableIndex;
    const children = this.childElements;
    const step = NAVIGATION_VALUE[direction as keyof typeof NAVIGATION_VALUE];
    const isRadio = this.type == "radio";

    for (let i = 1; i < children.length; i++) {
      // Support focus wrapping for type="radio" only.
      const nextIndex = isRadio
        ? (currentIndex + children.length + step * i) % children.length
        : currentIndex + step * i;

      const nextItem = children[nextIndex];

      if (nextItem && !nextItem.disabled) {
        nextItem.focus();
        if (isRadio) {
          this.value = nextItem.value;
          nextItem.click();
        }
        nextItem.focus();
        return;
      }
    }
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("name")) {
      this.handleSetName();
    }
    if (changedProperties.has("disabled")) {
      this.childElements.forEach((item) => {
        item.requestUpdate();
      });
    }
    if (changedProperties.has("type")) {
      // Do not set a role for radio buttons, as they're already implicitely
      // present on the actual radio buttons.
      const childRole = this.type == "radio" ? null : "option";
      this.childElements.forEach((item) => {
        item.role = childRole;
      });
    }
  }

  handleSetName() {
    this.childElements.forEach((item) => {
      item.name = this.name;
    });
  }

  // Re-dispatch change event so it's re-targeted to the custom element.
  handleChange(event: Event) {
    event.stopPropagation();
    this.dispatchEvent(new Event(event.type, event));
  }

  handleSlotChange() {
    this.#childElements = undefined;
    this.#focusedIndex = undefined;
    this.#checkedIndex = undefined;
    this.syncStateToChildElements();
  }

  render() {
    return html`
      <moz-fieldset
        part="fieldset"
        description=${ifDefined(this.description)}
        support-page=${ifDefined(this.supportPage)}
        role=${this.type == "radio" ? "radiogroup" : "listbox"}
        ?disabled=${this.disabled}
        label=${ifDefined(this.label)}
        .headingLevel=${this.headingLevel}
        exportparts="inputs, support-link"
        aria-orientation=${ifDefined(this.constructor.orientation)}
      >
        ${!this.supportPage
          ? html`<slot slot="support-link" name="support-link"></slot>`
          : ""}
        <slot
          @slotchange=${this.handleSlotChange}
          @change=${this.handleChange}
        ></slot>
      </moz-fieldset>
    `;
  }
}

/**
 * Class that can be extended by items nested in a subclass of
 * SelectControlBaseElement to handle selection, focus management, and keyboard
 * navigation. Implemented as a mixin to enable use with elements that inherit
 * from something other than MozLitElement.
 *
 * @param {LitElement} superClass
 * @returns LitElement
 */
export const SelectControlItemMixin = <
  T extends new (...args: any[]) => LitElement,
>(
  superClass: T,
) =>
  class extends superClass implements SelectControlItem {
    #controller!: SelectControlBaseElement;

    name = "";
    value = "";
    disabled = false;
    checked = false;
    itemTabIndex = 0;
    position = 0;

    static properties: PropertyDeclarations = {
      name: { type: String },
      value: { type: String },
      disabled: { type: Boolean, reflect: true },
      checked: { type: Boolean, reflect: true },
      itemTabIndex: { type: Number, state: true },
      position: { type: Number, state: true },
    };

    get controller() {
      return this.#controller;
    }

    get isDisabled() {
      return this.disabled || this.#controller.disabled;
    }

    constructor(...args: any[]) {
      super(...args);
      this.checked = false;
      this.addEventListener("focus", () => {
        if (!this.disabled) {
          this.controller.focusedIndex = this.position;
        }
      });
    }

    connectedCallback() {
      super.connectedCallback?.();

      const hostElement =
        this.parentElement || (this.getRootNode() as ShadowRoot).host;
      if (!(hostElement instanceof SelectControlBaseElement)) {
        console.error(
          `${this.localName} should only be used in an element that extends SelectControlBaseElement.`,
        );
      }

      this.#controller = hostElement as SelectControlBaseElement;
      if (this.#controller.type !== "radio") {
        // Set the role only if it's not already set in the inner HTML element.
        this.role = "option";
      }
      if (this.#controller.hasValue) {
        this.checked = this.value === this.#controller.value;
      }
    }

    willUpdate(changedProperties: PropertyValues<this>) {
      super.willUpdate?.(changedProperties);

      // Handle setting checked directly via JS.
      if (
        changedProperties.has("checked") &&
        this.checked &&
        this.#controller.hasValue &&
        this.value !== this.#controller.value
      ) {
        this.#controller.value = this.value;
      }

      // Handle un-checking directly via JS. If the checked item is un-checked,
      // the value of the associated focus manager parent needs to be un-set.
      if (
        changedProperties.has("checked") &&
        !this.checked &&
        this.#controller.hasValue &&
        this.value === this.#controller.value
      ) {
        this.#controller.value = "";
      }

      if (changedProperties.has("disabled")) {
        // Prevent enabling a items if containing focus manager is disabled.
        if (this.disabled === false && this.#controller.disabled) {
          this.disabled = true;
          return;
        }

        // Update items via focus manager parent for proper keyboard nav behavior.
        if (this.checked || !this.#controller.hasValue) {
          if (this.controller.checkedIndex != this.position) {
            this.#controller.syncFocusState();
          } else {
            // If the newly disabled element was checked unset the checkedIndex
            // to recompute which element should be focusable.
            this.controller.checkedIndex = undefined;
          }
        }
      }
    }

    handleClick() {
      if (this.isDisabled || this.checked) {
        return;
      }

      this.#controller.value = this.value;
      if (
        (this.getRootNode() as Document | ShadowRoot).activeElement
          ?.localName == this.localName
      ) {
        this.focus();
      }
    }

    // Re-dispatch change event so it propagates out of the element.
    handleChange(e: Event) {
      this.dispatchEvent(new Event(e.type, e));
    }
  };
