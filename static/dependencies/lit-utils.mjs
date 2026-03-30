/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this file,
* You can obtain one at http://mozilla.org/MPL/2.0/. */
import { LitElement, html, ifDefined, nothing, classMap, css } from "./lit.all.mjs";
import "./acorn-icon.mjs";
/**
* Helper for our replacement of @query. Used with `static queries` property.
*
* https://github.com/lit/lit/blob/main/packages/reactive-element/src/decorators/query.ts
*/
function query(el, selector) {
  return () => el.renderRoot.querySelector(selector);
}
/**
* Helper for our replacement of @queryAll. Used with `static queries` property.
*
* https://github.com/lit/lit/blob/main/packages/reactive-element/src/decorators/query-all.ts
*/
function queryAll(el, selector) {
  return () => el.renderRoot.querySelectorAll(selector);
}
/**
* MozLitElement provides extensions to the lit-provided LitElement class.
*
* ---------
*
* `@query` support (define a getter for a querySelector):
*
* static get queries() {
*   return {
*     propertyName: ".aNormal .cssSelector",
*     anotherName: { all: ".selectorFor .querySelectorAll" },
*   };
* }
*
* This example would add properties that would be written like this without
* using `queries`:
*
* get propertyName() {
*   return this.renderRoot?.querySelector(".aNormal .cssSelector");
* }
*
* get anotherName() {
*   return this.renderRoot?.querySelectorAll(".selectorFor .querySelectorAll");
* }
* ---------
*
* Automatic Fluent support for shadow DOM.
*
* Fluent requires that a shadowRoot be connected before it can use Fluent.
* Shadow roots will get connected automatically.
*
* ---------
*
* Automatic Fluent support for localized Reactive Properties
*
* When a Reactive Property can be set by fluent, set `fluent: true` in its
* property definition and it will automatically be added to the data-l10n-attrs
* attribute so that fluent will allow setting the attribute.
*
* ---------
*
* Mapped properties support (moving a standard attribute to rendered content)
*
* When you want to accept a standard attribute such as accesskey, title or
* aria-label at the component level but it should really be set on a child
* element then you can set the `mapped: true` option in your property
* definition and the attribute will be removed from the host when it is set.
* Note that the attribute can not be unset once it is set.
*
* ---------
*
* Test helper for sending events after a change: `dispatchOnUpdateComplete`
*
* When some async stuff is going on and you want to wait for it in a test, you
* can use `this.dispatchOnUpdateComplete(myEvent)` and have the test wait on
* your event.
*
* The component will then wait for your reactive property change to take effect
* and dispatch the desired event.
*
* Example:
*
* async onClick() {
*   let response = await this.getServerResponse(this.data);
*   // Show the response status to the user.
*   this.responseStatus = response.status;
*   this.dispatchOnUpdateComplete(
*     new CustomEvent("status-shown")
*   );
* }
*
* add_task(async testButton() {
*   let button = this.setupAndGetButton();
*   button.click();
*   await BrowserTestUtils.waitForEvent(button, "status-shown");
* });
*/
export class MozLitElement extends LitElement {
  #l10nObj;
  #l10nRootConnected = false;
  static createProperty(attrName, options) {
    if (options.mapped) {
      let domAttrPropertyName = `${attrName}Attribute`;
      let domAttrName = options.attribute ?? attrName.toLowerCase();
      if (attrName.startsWith("aria")) {
        domAttrName = domAttrName.replace("aria", "aria-");
      }
      this.mappedAttributes ??= [];
      this.mappedAttributes.push([attrName, domAttrPropertyName]);
      options.state = true;
      super.createProperty(domAttrPropertyName, {
        type: String,
        attribute: domAttrName,
        reflect: true
      });
    }
    if (options.fluent) {
      this.fluentProperties ??= [];
      this.fluentProperties.push(options.attribute || attrName.toLowerCase());
    }
    return super.createProperty(attrName, options);
  }
  constructor() {
    super();
    let { queries } = this.constructor;
    if (queries) {
      for (let [selectorName, selector] of Object.entries(queries)) {
        if (selector.all) {
          Object.defineProperty(this, selectorName, { get: queryAll(this, selector.all) });
        } else {
          Object.defineProperty(this, selectorName, { get: query(this, selector) });
        }
      }
    }
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.renderRoot == this.shadowRoot && !this.#l10nRootConnected && this.#l10n) {
      this.#l10n.connectRoot(this.renderRoot);
      this.#l10nRootConnected = true;
      if (this.constructor.fluentProperties?.length) {
        let { fluentProperties } = this.constructor;
        if (this.dataset.l10nAttrs) {
          // Not worrying about duplication since this may happen a lot and we
          // could avoid it by not providing the duplicates manually.
          // Copy the fluentProperties since they're stored on our class.
          fluentProperties = fluentProperties.concat(this.dataset.l10nAttrs);
        }
        this.dataset.l10nAttrs = fluentProperties.join(",");
        if (this.dataset.l10nId) {
          this.#l10n.translateElements([this]);
        }
      }
    }
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.renderRoot == this.shadowRoot && this.#l10nRootConnected && this.#l10n) {
      this.#l10n.disconnectRoot(this.renderRoot);
      this.#l10nRootConnected = false;
    }
  }
  willUpdate(changes) {
    this.#handleMappedAttributeChange(changes);
  }
  #handleMappedAttributeChange(changes) {
    if (!this.constructor.mappedAttributes) {
      return;
    }
    for (let [attrName, domAttrName] of this.constructor.mappedAttributes) {
      if (changes.has(domAttrName)) {
        this[attrName] = this[domAttrName];
        this[domAttrName] = null;
      }
    }
  }
  get #l10n() {
    if (!this.#l10nObj) {
      this.#l10nObj = window.Cu?.isInAutomation && window.mockL10n || document.l10n;
    }
    return this.#l10nObj;
  }
  async dispatchOnUpdateComplete(event) {
    await this.updateComplete;
    this.dispatchEvent(event);
  }
  update() {
    super.update();
    if (this.#l10n) {
      this.#l10n.translateFragment(this.renderRoot);
    }
  }
}
/**
* A base input element. Provides common layout and properties for our design
* system input elements.
*
* Subclasses must implement the inputTemplate() method which returns the input
* template for this specific input element with its id set to "input".
*
* @property {string} label - The text of the label element
* @property {string} name - The name of the input control
* @property {string} value - The value of the input control
* @property {boolean} disabled - The disabled state of the input control
* @property {string} iconSrc - The src for an optional icon
* @property {string} description - The text for the description element that helps describe the input control
* @property {string} supportPage - Name of the SUMO support page to link to.
* @property {boolean} parentDisabled - When this element is nested under another input and that
*     input is disabled or unchecked/unpressed the parent will set this property to true so this
*     element can be disabled.
* @property {string} ariaLabel - The aria-label text when there is no visible label.
* @property {string} ariaDescription - The aria-description text when there is no visible description.
*/
export class MozBaseInputElement extends MozLitElement {
  static formAssociated = true;
  #internals;
  #hasSlottedContent = new Map();
  static properties = {
    label: {
      type: String,
      fluent: true
    },
    name: { type: String },
    value: { type: String },
    iconSrc: { type: String },
    disabled: { type: Boolean },
    description: {
      type: String,
      fluent: true
    },
    supportPage: {
      type: String,
      attribute: "support-page"
    },
    accessKey: {
      type: String,
      mapped: true,
      fluent: true
    },
    parentDisabled: {
      type: Boolean,
      state: true
    },
    ariaLabel: {
      type: String,
      mapped: true
    },
    ariaDescription: {
      type: String,
      mapped: true
    },
    inputLayout: {
      type: String,
      reflect: true,
      attribute: "inputlayout"
    }
  };
  /** @type {"inline" | "block" | "inline-end"} */
  static inputLayout = "inline";
  /** @type {keyof MozBaseInputElement} */
  static activatedProperty = null;
  constructor() {
    super();
    this.disabled = false;
    this.inputLayout = this.constructor.inputLayout;
    this.#internals = this.attachInternals();
  }
  get form() {
    return this.#internals.form;
  }
  /**
  * @param {string} value The current value of the element.
  */
  setFormValue(value) {
    this.#internals.setFormValue(value);
  }
  formResetCallback() {
    this.value = this.defaultValue;
  }
  connectedCallback() {
    super.connectedCallback();
    /** @type {string} val */
    let val = this.getAttribute("value") || this.value;
    this.defaultValue = val;
    this.value = val;
    this.#internals.setFormValue(this.value || null);
  }
  willUpdate(changedProperties) {
    super.willUpdate(changedProperties);
    this.#updateInternalState(this.description, "description");
    this.#updateInternalState(this.supportPage, "support-link");
    this.#updateInternalState(this.label, "label");
    if (changedProperties.has("value")) {
      this.setFormValue(this.value);
    }
    let activatedProperty = this.constructor.activatedProperty;
    if (activatedProperty && changedProperties.has(activatedProperty) || changedProperties.has("disabled") || changedProperties.has("parentDisabled")) {
      this.updateNestedElements();
    }
  }
  #updateInternalState(propVal, stateKey) {
    let internalStateKey = `has-${stateKey}`;
    let hasValue = !!(propVal || this.#hasSlottedContent.get(stateKey));
    if (this.#internals.states?.has(internalStateKey) == hasValue) {
      return;
    }
    if (hasValue) {
      this.#internals.states.add(internalStateKey);
    } else {
      this.#internals.states.delete(internalStateKey);
    }
  }
  updateNestedElements() {
    if (this.isDisabled) {
      this.#internals.states.add("disabled");
    } else {
      this.#internals.states.delete("disabled");
    }
    for (let el of this.nestedEls) {
      if ("parentDisabled" in el) {
        el.parentDisabled = this.parentDisabled || !this[this.constructor.activatedProperty] || this.disabled;
      }
    }
  }
  get inputEl() {
    return this.renderRoot.getElementById("input");
  }
  get labelEl() {
    return this.renderRoot.querySelector("label");
  }
  get icon() {
    return this.renderRoot.querySelector(".icon");
  }
  get descriptionEl() {
    return this.renderRoot.getElementById("description");
  }
  get nestedEls() {
    return this.renderRoot.querySelector(".nested")?.assignedElements() ?? [];
  }
  get hasDescription() {
    return this.#internals.states.has("has-description");
  }
  get hasSupportLink() {
    return this.#internals.states.has("has-support-link");
  }
  get hasLabel() {
    return this.#internals.states.has("has-label");
  }
  get isDisabled() {
    return !!(this.disabled || this.parentDisabled);
  }
  click() {
    this.inputEl.click();
  }
  focus() {
    this.inputEl.focus();
  }
  select() {
    this.inputEl.select();
  }
  blur() {
    this.inputEl.blur();
  }
  /**
  * Dispatches an event from the host element so that outside
  * listeners can react to these events
  *
  * @param {Event} event
  * @memberof MozBaseInputElement
  */
  redispatchEvent(event) {
    let { bubbles, cancelable, composed, type } = event;
    let newEvent = new Event(type, {
      bubbles,
      cancelable,
      composed
    });
    this.dispatchEvent(newEvent);
  }
  inputTemplate() {
    throw new Error("inputTemplate() must be implemented and provide the input element");
  }
  inputStylesTemplate() {
    return nothing;
  }
  render() {
    return html`
      ${this.inputStylesTemplate()}
      <div class="content-wrapper">
        <span class="label-wrapper">
          <label
            is="moz-label"
            id="label"
            part="label"
            for="input"
            shownaccesskey=${ifDefined(this.accessKey)}
            >${this.inputLayout === "inline" ? this.inputTemplate() : ""}${this.labelTemplate()}</label
          >${this.hasDescription ? "" : this.supportLinkTemplate()}
          ${this.descriptionTemplate()}
        </span>
        ${this.inputLayout !== "inline" ? this.inputTemplate() : ""}
      </div>
      ${this.nestedFieldsTemplate()}
    `;
  }
  labelTemplate() {
    if (!this.label) {
      return "";
    }
    let labelEl;
    if (this.getAttribute("headinglevel") == "2") {
      // Undocumented hack for AI controls, do not use, it WILL be removed. (bug 2012250)
      labelEl = html`<h2
        class="text text-box-trim-start"
        .textContent=${this.label}
      ></h2>`;
    } else {
      labelEl = html`<span class="text" .textContent=${this.label}></span>`;
    }
    return html`<span class="text-container"
      >${this.iconTemplate()}${labelEl}</span
    >`;
  }
  descriptionTemplate() {
    return html`
      <div class="description text-deemphasized">
        <span id="description" class="description-text">
          ${this.description ?? html`<slot
            name="description"
            @slotchange=${this.onSlotchange}
          ></slot>`}</span
        >${this.hasDescription ? this.supportLinkTemplate() : ""}
      </div>
    `;
  }
  iconTemplate() {
    if (this.iconSrc) {
      return html`<acorn-icon src=${this.iconSrc} role="presentation" class="icon"></acorn-icon>`;
    }
    return "";
  }
  supportLinkTemplate() {
    if (this.supportPage) {
      return html`<a
        is="moz-support-link"
        support-page=${this.supportPage}
        part="support-link"
        aria-describedby="label description"
      ></a>`;
    }
    return html`<slot
      name="support-link"
      @slotchange=${this.onSlotchange}
    ></slot>`;
  }
  nestedFieldsTemplate() {
    if (this.constructor.activatedProperty) {
      return html`<slot
        name="nested"
        class="nested"
        @slotchange=${this.updateNestedElements}
      ></slot>`;
    }
    return "";
  }
  onSlotchange(e) {
    let propName = e.target.name;
    let hasSlottedContent = e.target.assignedNodes().some((node) => node.textContent.trim() || node.getAttribute("data-l10n-id"));
    if (hasSlottedContent == this.#hasSlottedContent.get(propName)) {
      return;
    }
    this.#hasSlottedContent.set(propName, hasSlottedContent);
    this.requestUpdate();
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From ./moz-input-common.css */
@import "./text-and-typography.css";

@layer input-common {
  :host {
    --input-height: var(--size-item-small);
    --input-width: var(--size-item-small);
    --input-space-offset: calc(var(--input-width)  + var(--space-small));
    --input-nested-offset: var(--input-space-offset);
    --input-margin-block-adjust: calc((1lh - var(--input-height)) / 2);
    --icon-margin-block-adjust: calc((1lh - var(--icon-size)) / 2);
    --input-margin-inline-start-adjust: calc(-1 * var(--input-space-offset));
  }

  :host(:not(:state(has-label))) {
    --input-space-offset: var(--input-width);
  }

  :host([inputlayout="block"]) {
    --input-space-offset: 0;
    --input-nested-offset: var(--space-xlarge);
    --input-margin-block-adjust: var(--space-xsmall) 0;
  }

  :host([inputlayout="block"]:not(:state(has-label), :state(has-description))) {
    --input-margin-block-adjust: 0;
  }

  :host([inputlayout="inline-end"]) {
    --input-space-offset: 0;
    --input-nested-offset: var(--space-xlarge);
  }

  :host(:not([hidden])) {
    display: block;
  }

  :host(:not([hidden], :state(has-label), [inputlayout="block"])) {
    display: inline-block;
  }

  @media (forced-colors) {
    :host(:state(disabled)) {
      color: graytext;
    }
  }

  :host([inputlayout="inline-end"]) .content-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-medium);

    & > .label-wrapper {
      flex: 1;
    }
  }

  :host([inputlayout="inline-end"]) .description {
    margin-block-start: var(--space-xxsmall);
  }

  .label-wrapper {
    display: block;
    padding-inline-start: var(--input-space-offset);
  }

  label {
    display: block;

    &:has( + a[is="moz-support-link"]), :host(:not(:state(has-description)):state(has-support-link)) & {
      display: inline;
      margin-inline-end: var(--space-xsmall);
    }

    :host(:state(disabled)) & {
      color: var(--text-color-disabled);
    }
  }

  :host(.text-truncated-ellipsis) .text-container {
    display: inline-block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  h2.text {
    display: inline-block;
    margin: 0;
  }

  #input {
    -moz-theme: non-native;
    min-width: var(--input-width);
    min-height: var(--input-height);
    font-size: inherit;
    font-family: inherit;
    line-height: inherit;
    vertical-align: top;
    margin-block: var(--input-margin-block-adjust);
    margin-inline: var(--input-margin-inline-start-adjust) var(--space-small);

    :host(:not(:state(has-label))) & {
      margin-inline-end: 0;
    }

    @media not (forced-colors) {
      accent-color: var(--color-accent-primary);
    }
  }

  .icon {
    vertical-align: top;
    width: var(--icon-size);
    height: var(--icon-size);
    margin-block: var(--icon-margin-block-adjust);
color: currentColor;
    & + .text {
      margin-inline-start: var(--space-small);
    }
  }

  :host(:state(has-description)) .description {
    margin-block-start: var(--space-xxsmall);
  }

  :host(:state(has-description):state(has-support-link)) .description-text {
    margin-inline-end: var(--space-xsmall);
  }

  ::slotted([slot="description"]) {
    display: inline;
  }

  :host(.text-truncated-ellipsis) .description {
    white-space: initial;
  }

  a[is="moz-support-link"]:not([hidden]), ::slotted([slot="support-link"]:not([hidden])) {
    display: inline-block;
  }

  .nested {
    margin-inline-start: var(--input-nested-offset);
    display: flex;
    flex-direction: column;
  }

  ::slotted([slot="nested"]) {
    margin-block-start: var(--space-large);
  }

  input:is([type="tel"], [type="url"], [type="email"], [type="number"]):not(:placeholder-shown) {
    direction: ltr;
    text-align: match-parent;
  }
}

`];
}
/**
* Base class for moz-box-* elements providing common properties and templates.
*
* @property {string} label - The text for the label element.
* @property {string} description - The text for the description element.
* @property {string} iconSrc - The src for an optional icon.
*/
export class MozBoxBase extends MozLitElement {
  static properties = {
    label: {
      type: String,
      fluent: true
    },
    description: {
      type: String,
      fluent: true
    },
    iconSrc: { type: String }
  };
  constructor() {
    super();
    this.label = "";
    this.description = "";
    this.iconSrc = "";
  }
  get labelEl() {
    return this.renderRoot.querySelector(".label");
  }
  get descriptionEl() {
    return this.renderRoot.querySelector(".description");
  }
  get iconEl() {
    return this.renderRoot.querySelector(".icon");
  }
  stylesTemplate() {
    return html`
      `;
  }
  textTemplate() {
    return html`<div
      class=${classMap({
      "text-content": true,
      "has-icon": this.iconSrc,
      "has-description": this.description
    })}
    >
      ${this.iconTemplate()}${this.labelTemplate()}${this.descriptionTemplate()}
    </div>`;
  }
  labelTemplate() {
    if (!this.label) {
      return "";
    }
    return html`<span class="label" id="label">${this.label}</span>`;
  }
  iconTemplate() {
    if (!this.iconSrc) {
      return "";
    }
    return html`<acorn-icon src=${this.iconSrc} role="presentation" class="icon"></acorn-icon>`;
  }
  descriptionTemplate() {
    if (!this.description) {
      return "";
    }
    return html`<span class="description text-deemphasized" id="description">
      ${this.description}
    </span>`;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From ./moz-box-common.css */
@layer box-common {
  :host {
    --box-border-width: var(--border-width);
    --box-border-color: var(--border-color);
    --box-border: var(--box-border-width) solid var(--box-border-color);
    --box-border-radius: var(--border-radius-medium);
    --box-border-radius-inner: calc(var(--box-border-radius)  - var(--border-width));
    --box-padding: var(--space-large);
    --box-icon-size: var(--icon-size);
    --box-icon-fill: var(--icon-color);
    --box-icon-stroke: var(--box-icon-fill);
    --box-button-background-color: var(--button-background-color-menu);
    --box-button-background-color-hover: var(--button-background-color-menu-hover);
    --box-button-background-color-active: var(--button-background-color-menu-active);
    --box-button-background-color-disabled: var(--button-background-color-menu-disabled);
    --box-button-text-color: var(--button-text-color-menu);
    --box-button-text-color-hover: var(--button-text-color-menu-hover);
    --box-button-text-color-active: var(--button-text-color-menu-active);
    --box-button-text-color-disabled: var(--button-text-color-menu-disabled);
    border-inline-start: var(--box-border-inline-start, var(--box-border));
    border-inline-end: var(--box-border-inline-end, var(--box-border));
    border-block-start: var(--box-border-block-start, var(--box-border));
    border-block-end: var(--box-border-block-end, var(--box-border));
    border-start-start-radius: var(--box-border-radius-start, var(--box-border-radius));
    border-start-end-radius: var(--box-border-radius-start, var(--box-border-radius));
    border-end-start-radius: var(--box-border-radius-end, var(--box-border-radius));
    border-end-end-radius: var(--box-border-radius-end, var(--box-border-radius));
    display: block;
    position: relative;
  }

  .text-content {
    display: grid;
    place-items: center start;
    gap: var(--space-xsmall) var(--space-small);
    grid-template-columns: var(--box-icon-size) 1fr;
    grid-template-areas: "label label";

    &.has-icon {
      grid-template-areas: "icon label";
    }

    &.has-description {
      grid-template-areas: "label label"
                           "description description";
    }

    &.has-icon.has-description {
      grid-template-areas: "icon label"
                           "description description";
    }
  }

  .label {
    grid-area: label;
    font-weight: var(--box-label-font-weight, normal);
    align-self: var(--box-label-alignment);
  }

  .icon {
    grid-area: icon;
    width: var(--box-icon-size);
    height: var(--box-icon-size);
color: var(--box-icon-fill);
border-radius: var(--box-icon-border-radius);

    &:not(.nav-icon) {
      fill: var(--box-icon-start-fill, var(--box-icon-fill));
      stroke: var(--box-icon-start-stroke, var(--box-icon-stroke));

      .button & {
        fill: var(--box-icon-start-fill, var(--button-icon-fill));
        stroke: var(--box-icon-start-stroke, var(--button-icon-stroke));
      }
    }

    @media (prefers-contrast) {
      .button & {
        --box-icon-fill: var(--button-icon-fill);
        --box-icon-stroke: var(--button-icon-stroke);
        --box-icon-start-fill: var(--box-icon-fill);
        --box-icon-start-stroke: var(--box-icon-stroke);
      }
    }
  }

  .description {
    grid-area: description;
    display: flex;
    justify-content: center;
    gap: var(--space-small);
    align-self: var(--box-description-alignment);
  }
}

.button {
  box-sizing: border-box;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  font-family: inherit;
  font-size: inherit;
  appearance: none;
  background-color: var(--box-button-background-color);
  color: var(--box-button-text-color);
  display: flex;
  padding: var(--box-padding);
  text-align: start;
  border: none;
  border-start-start-radius: var(--box-border-radius-start, var(--box-border-radius-inner));
  border-start-end-radius: var(--box-border-radius-start, var(--box-border-radius-inner));
  border-end-start-radius: var(--box-border-radius-end, var(--box-border-radius-inner));
  border-end-end-radius: var(--box-border-radius-end, var(--box-border-radius-inner));

  &:focus-visible {
    outline: var(--focus-outline);
    outline-offset: var(--focus-outline-inset);
  }

  &:hover {
    background-color: var(--box-button-background-color-hover);
    color: var(--box-button-text-color-hover);
  }

  &:hover:active:not(:disabled) {
    background-color: var(--box-button-background-color-active);
    color: var(--box-button-text-color-active);
  }

  &:disabled {
    background-color: var(--box-button-background-color-disabled);
    color: var(--box-button-text-color-disabled);
    opacity: var(--button-opacity-disabled);
  }
}

.nav-icon:dir(rtl) {
  scale: -1 1;
}

`];
}
