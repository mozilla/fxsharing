/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, nothing, classMap, css } from "../../dependencies/lit.all.mjs";
import { SelectControlItemMixin, SelectControlBaseElement } from "../../dependencies/lit-select-control.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
import { ifDefined } from "../../dependencies/lit.all.mjs";
import "../../dependencies/acorn-icon.mjs";
/**
* An element that groups related items and allows a user to navigate between
* them to select an item. The appearance of the items of the group is
* determined by the consumer.
*
* @tagname moz-visual-picker
* @property {string} label - Label for the group of elements.
* @property {string} description - Description for the group of elements.
* @property {string} name
*  Name used to associate items in the group. Propagates to
*  moz-visual-picker's children.
* @property {string} value
*  Selected value for the group. Changing the value updates the checked
*  state of moz-visual-picker-item children and vice versa.
* @slot default - The picker's content, intended for moz-visual-picker-items.
*/
export class MozVisualPicker extends SelectControlBaseElement {
  static childElementName = "moz-visual-picker-item";
  static orientation = "horizontal";
}
if (!customElements.get("moz-visual-picker")) { customElements.define("moz-visual-picker", MozVisualPicker); }
/**
* Element that allows a user to select one option from a group of options.
* Visual appearance is determined by the slotted content.
*
* @tagname moz-visual-picker-item
* @property {boolean} checked - Whether or not the item is selected.
* @property {boolean} disabled - Whether or not the item is disabled.
* @property {number} itemTabIndex
*  Tabindex of the input element. Only one item is focusable at a time.
* @property {string} name
*  Name of the item, set by the associated moz-visual-picker parent element.
* @property {string} value - Value of the item.
* @property {string} label - Visible label for the picker item.
* @property {string} description - Additional text shown beneath the label.
* @property {string} ariaLabel - Value for the aria-label attribute.
* @property {string} imageSrc - Path to an image to display in the picker item.
* @slot default - The item's content, used for what gets displayed.
*/
export class MozVisualPickerItem extends SelectControlItemMixin(MozLitElement) {
  static properties = {
    label: {
      type: String,
      fluent: true
    },
    description: {
      type: String,
      fluent: true
    },
    ariaLabel: {
      type: String,
      fluent: true,
      mapped: true
    },
    imageSrc: { type: String }
  };
  static queries = {
    itemEl: ".picker-item",
    labelEl: ".label",
    descriptionEl: ".description"
  };
  click() {
    this.itemEl.click();
  }
  focus() {
    this.itemEl.focus();
  }
  blur() {
    this.itemEl.blur();
  }
  handleKeydown(event) {
    if (event.code == "Space" || event.code == "Enter") {
      this.handleClick(event);
    }
  }
  handleClick(event) {
    // re-target click events from the slot to the item and handle clicks from
    // space bar keydown.
    event.stopPropagation();
    this.dispatchEvent(new Event("click", {
      bubbles: true,
      composed: true
    }));
    super.handleClick();
    // Manually dispatch events since we're not using an input.
    this.dispatchEvent(new Event("input", {
      bubbles: true,
      composed: true
    }));
    this.dispatchEvent(new Event("change", {
      bubbles: true,
      composed: true
    }));
  }
  handleSlotchange(event) {
    // If the user hasn't provide a visual or accessible label fallback to
    // labelling the picker item based on slotted content.
    if (!this.label && !this.ariaLabel) {
      let elements = event.target.assignedElements();
      this.itemEl.ariaLabelledByElements = elements;
    }
  }
  contentTemplate() {
    if (!this.imageSrc && !this.label && !this.description) {
      return html`<slot></slot>`;
    }
    return html`
      ${this.imageSrc ? html`<acorn-icon src=${this.imageSrc} role="presentation" part="image"></acorn-icon>` : nothing}
      <div class="text-content">
        ${this.label ? html`<p class="label">${this.label}</p>` : nothing}
        ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
      </div>
    `;
  }
  render() {
    return html`
      <div
        class=${classMap({
      "picker-item": true,
      "image-item": this.imageSrc && this.label
    })}
        role=${this.role}
        value=${this.value}
        aria-label=${ifDefined(this.ariaLabel)}
        aria-checked=${this.role == "radio" ? this.checked : nothing}
        aria-selected=${this.role == "option" ? this.checked : nothing}
        tabindex=${this.itemTabIndex}
        ?checked=${this.checked}
        ?disabled=${this.isDisabled}
        @click=${this.handleClick}
        @keydown=${this.handleKeydown}
        @slotchange=${this.handleSlotchange}
      >
        ${this.contentTemplate()}
      </div>
    `;
  }
  static styles = [css`/* From chrome://global/content/elements/moz-visual-picker-item.css */
:host {
  --visual-picker-item-border-radius: var(--border-radius-medium);
  --visual-picker-item-border-width: var(--border-width);
  --visual-picker-item-border-color: var(--border-color-interactive);
  cursor: default;
  display: flex;
}

.picker-item {
  --visual-picker-item-border-radius-inner: calc(var(--visual-picker-item-border-radius)  - var(--visual-picker-item-border-width));
  overflow: hidden;
  border: var(--visual-picker-item-border-width) solid var(--visual-picker-item-border-color);
  border-radius: var(--visual-picker-item-border-radius);
  margin: 2px;
  flex: 1;

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: var(--focus-outline);
    outline-offset: var(--focus-outline-offset);
  }

  &[checked] {
    --visual-picker-item-border-width: 3px;
    border-color: var(--border-color-selected);
    margin: 0;
  }

  & ::slotted(:first-child) {
    --visual-picker-item-child-border-radius: var(--visual-picker-item-border-radius-inner);
    border-radius: var(--visual-picker-item-child-border-radius);
  }

  & .text-content:has(.label, .description) {
    padding: var(--space-small) var(--space-medium) var(--space-medium);
    text-align: center;
  }

  & .label {
    margin: 0;
  }

  & .description {
    margin: 0;
    font-size: var(--font-size-small);
    color: var(--text-color-deemphasized);
  }

  & .label + .description {
    margin-block-start: var(--space-xsmall);
  }

  & img, & acorn-icon {
    display: block;
    width: 100%;
  }
}

.image-item {
  background-color: var(--background-color-box);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  &:hover {
    background-color: var(--button-background-color-hover);
  }

  &:hover:active {
    background-color: var(--button-background-color-active);
  }
}

`];
}
if (!customElements.get("moz-visual-picker-item")) { customElements.define("moz-visual-picker-item", MozVisualPickerItem); }
