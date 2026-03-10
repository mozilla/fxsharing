/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, nothing, css } from "lit";
import type {
  PropertyDeclaration,
  PropertyDeclarations,
  PropertyValues,
  CSSResultGroup,
} from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";

import inputCommonCss from "./moz-input-common/moz-input-common.css";
import mozBoxCommonCss from "./moz-box-common/moz-box-common.css";
import textAndTypographyCss from "design-system/text-and-typography.css";

declare module "lit" {
  interface PropertyDeclaration {
    readonly mapped?: boolean;
    readonly fluent?: boolean;
  }
}

/**
 * Helper for our replacement of @query. Used with `static queries` property.
 *
 * https://github.com/lit/lit/blob/main/packages/reactive-element/src/decorators/query.ts
 */
function query(el: LitElement, selector: string) {
  return () => el.renderRoot.querySelector(selector);
}

/**
 * Helper for our replacement of @queryAll. Used with `static queries` property.
 *
 * https://github.com/lit/lit/blob/main/packages/reactive-element/src/decorators/query-all.ts
 */
function queryAll(el: LitElement, selector: string) {
  return () => el.renderRoot.querySelectorAll(selector);
}

const sharedStyles = {
  common: [
    css`
      :host {
        --heading-margin-block-bottom: var(--space-small);
      }
      h1,
      h2,
      h3 {
        margin-block: 0 var(--heading-margin-block-bottom);
      }

      h4 {
        margin-block: 0;
      }

      .subtitle {
        color: var(--text-color-deemphasized);
      }

      .contextual-icon {
        /* This trick adapts the icon to dark and light mode, basically doing like
        * a context fill.*/
        background-color: currentColor;
        --webkit-mask: var(--icon-url);
        mask: var(--icon-url);
        mask-size: contain;
        mask-repeat: no-repeat;
      }

      .visually-hidden {
        clip-path: inset(100%);
        clip: rect(1px, 1px, 1px, 1px);
        height: 1px;
        overflow: hidden;
        position: absolute;
        white-space: nowrap;
        width: 1px;
      }

      /* Common table styles */
      table {
        border-collapse: collapse;
        width: 100%;
        table-layout: fixed;
        word-break: break-word;
      }

      table,
      th,
      td {
        text-align: start;
      }

      th[scope="col"] {
        border-block-end: 1px solid
          var(--header-border-color, var(--border-color));

        /* 56 px */
        height: calc(14 * var(--space-xsmall));
        padding-block: 0;

        .table-compact & {
          /* 40 px */
          height: calc(10 * var(--space-xsmall));
        }

        .table-xcompact & {
          height: unset;
          /* Put back the padding. TODO use "box-sizing: border-box" everywhere
           * to avoid this dance. */
          padding: var(--cell-padding, var(--space-small));
        }
      }

      td,
      th {
        padding: var(--cell-padding, var(--space-small));
      }

      [hidden] {
        display: none !important;
      }

      a {
        color: var(--link-color);

        &:visited {
          color: var(--link-color-visited);
        }
        &:hover {
          color: var(--link-color-hover);
        }
        &:hover:active {
          color: var(--link-color-active);
          text-decoration: none;
        }
      }

      .sticky-message-bar {
        width: 80ch;
        max-width: 100%;
        position: fixed;
        top: 0;
        left: 50%;
        translate: -50%;
        z-index: 1;
      }

      /* Maintain direction in some input types */
      /* Inspiration from https://fokus.dev/tools/uaplus/ */
      :where(
        input[type="tel"],
        input[type="url"],
        input[type="email"],
        input[type="number"]
      ):not(:placeholder-shown) {
        direction: ltr;
      }

      /* Use the pointer cursor for our buttons */
      :where(
        button,
        input[type="button"],
        input[type="submit"],
        input[type="radio"],
        select,
        label[for],

      ):not(:disabled) {
        cursor: pointer;
      }
      :where(label) {
        cursor: inherit;
      }

      dialog::backdrop {
        background: var(--box-shadow-color-darker-layer-2);
      }
    `,
    textAndTypographyCss,
  ],
};

export const styles = sharedStyles;

/**
 * MozLitElement provides extensions to the lit-provided LitElement class.
 *
 *******
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
 *******
 *
 * Automatic Fluent support for shadow DOM.
 *
 * Fluent requires that a shadowRoot be connected before it can use Fluent.
 * Shadow roots will get connected automatically.
 *
 *******
 *
 * Automatic Fluent support for localized Reactive Properties
 *
 * When a Reactive Property can be set by fluent, set `fluent: true` in its
 * property definition and it will automatically be added to the data-l10n-attrs
 * attribute so that fluent will allow setting the attribute.
 *
 *******
 *
 * Mapped properties support (moving a standard attribute to rendered content)
 *
 * When you want to accept a standard attribute such as accesskey, title or
 * aria-label at the component level but it should really be set on a child
 * element then you can set the `mapped: true` option in your property
 * definition and the attribute will be removed from the host when it is set.
 * Note that the attribute can not be unset once it is set.
 *
 *******
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
  #l10nRootConnected = false;
  private static mappedAttributes: Array<[string, string]>;
  private static fluentProperties: string[];
  declare static queries: Record<string, string | { all: string }>;

  // See https://github.com/microsoft/TypeScript/issues/3841#issuecomment-1488919713
  declare ["constructor"]: typeof MozLitElement;

  static styles: CSSResultGroup = sharedStyles.common;

  static createProperty(
    attrName: PropertyKey,
    options: PropertyDeclaration<unknown, unknown> = {},
  ) {
    const strAttrName = String(attrName);
    let domAttrName =
      typeof options.attribute === "string"
        ? options.attribute
        : options.attribute === false
          ? false
          : strAttrName.toLowerCase();
    if (options.mapped) {
      const domAttrPropertyName = `${strAttrName}Attribute`;
      if (domAttrName === false) {
        throw new Error(
          `"mapped" is true but "attribute" is false, this isn't correct.`,
        );
      }
      if (strAttrName.startsWith("aria")) {
        domAttrName = domAttrName.replace("aria", "aria-");
      }
      this.mappedAttributes ??= [];
      this.mappedAttributes.push([strAttrName, domAttrPropertyName]);
      Object.assign(options, { state: true });
      super.createProperty(domAttrPropertyName, {
        type: String,
        attribute: domAttrName,
        reflect: true,
      });
    }
    if (options.fluent) {
      if (domAttrName === false) {
        throw new Error(
          `"fluent" is true but "attribute" is false, this isn't correct.`,
        );
      }
      this.fluentProperties ??= [];
      this.fluentProperties.push(domAttrName);
    }
    return super.createProperty(attrName, options);
  }

  constructor() {
    super();
    const { queries } = this.constructor;
    if (queries) {
      for (const [selectorName, selector] of Object.entries(queries)) {
        if (typeof selector !== "string") {
          Object.defineProperty(this, selectorName, {
            get: queryAll(this, selector.all),
          });
        } else {
          Object.defineProperty(this, selectorName, {
            get: query(this, selector),
          });
        }
      }
    }
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (
      this.renderRoot == this.shadowRoot &&
      !this.#l10nRootConnected &&
      this.#l10n
    ) {
      this.#l10n.connectRoot(this.renderRoot);
      this.#l10nRootConnected = true;

      if (this.constructor.fluentProperties?.length) {
        this.dataset.l10nAttrs = this.constructor.fluentProperties.join(",");
        if (this.dataset.l10nId) {
          this.#l10n.translateElements([this]);
        }
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (
      this.renderRoot == this.shadowRoot &&
      this.#l10nRootConnected &&
      this.#l10n
    ) {
      this.#l10n.disconnectRoot(this.renderRoot);
      this.#l10nRootConnected = false;
    }
  }

  willUpdate(changes: PropertyValues<this>) {
    this.#handleMappedAttributeChange(changes);
  }

  #handleMappedAttributeChange(changes: PropertyValues<this>) {
    if (!this.constructor.mappedAttributes) {
      return;
    }
    for (const [attrName, domAttrName] of this.constructor.mappedAttributes) {
      if (changes.has(domAttrName as keyof MozLitElement)) {
        // @ts-expect-error This code is too dynamic for Typescript
        this[attrName] = this[domAttrName];
        // @ts-expect-error This code is too dynamic for Typescript
        this[domAttrName] = null;
      }
    }
  }

  get #l10n() {
    return document.l10n;
  }

  async dispatchOnUpdateComplete(event: Event) {
    await this.updateComplete;
    this.dispatchEvent(event);
  }

  update(changedProperties: PropertyValues<this>) {
    super.update(changedProperties);
    if (this.#l10n) {
      this.#l10n.translateFragment(this.renderRoot);
    }
  }

  /**
   * Dispatches an event from the host element so that outside
   * listeners can react to these events
   */
  redispatchEvent(event: Event) {
    const { bubbles, cancelable, composed, type } = event;
    const newEvent = new Event(type, {
      bubbles,
      cancelable,
      composed,
    });
    this.dispatchEvent(newEvent);
  }
}

/**
 * A base input element. Provides common layout and properties for our design
 * system input elements.
 *
 * Subclasses must implement the inputTemplate() method which returns the input
 * template for this specific input element with its id set to "input".
 */
export class MozBaseInputElement<
  T extends HTMLInputElement | HTMLSelectElement | HTMLButtonElement =
    HTMLInputElement,
> extends MozLitElement {
  #internals;
  #hasSlottedContent = new Map();

  // The text of the label element
  label?: string;

  // The name of the input control
  name?: string;

  // The value of the input control
  value: string = "";

  // The disabled state of the input control
  disabled: boolean;

  // The src for an optional icon
  iconSrc?: string;

  // The text for the description element that helps describe the input control
  description?: string;

  // Name of the SUMO page to link to
  supportPage?: string;

  // Is this input required in a form
  required: boolean = false;

  // pattern for input validation
  pattern?: string;

  // When this element is nested under another input and that input is disabled
  // or unchecked/unpressed the parent will set this property to true so this
  // element can be disabled.
  parentDisabled?: boolean;

  static properties: PropertyDeclarations = {
    label: { type: String, fluent: true },
    name: { type: String },
    value: { type: String },
    iconSrc: { type: String },
    disabled: { type: Boolean },
    description: { type: String, fluent: true },
    supportPage: { type: String, attribute: "support-page" },
    accessKey: { type: String, mapped: true, fluent: true },
    parentDisabled: { type: Boolean, state: true },
    ariaLabel: { type: String, mapped: true },
    ariaDescription: { type: String, mapped: true },
    required: { type: Boolean },
    pattern: { type: String },
  };

  static inputLayout = "inline";

  static formAssociated = true;

  // This will be implemented in subclasses. Make sure this is an actual
  // property in the subclass.
  declare static activatedProperty: string;

  // See https://github.com/microsoft/TypeScript/issues/3841#issuecomment-1488919713
  declare ["constructor"]: typeof MozBaseInputElement;

  static styles: CSSResultGroup = [MozLitElement.styles, inputCommonCss];
  static override shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    // Use delegatesFocus so that this element is focusable, and
    // form.reportValidity() works as a result.
    delegatesFocus: true,
  };

  constructor() {
    super();
    this.disabled = false;

    this.#internals = this.attachInternals();
    this.addEventListener("keydown", this.#handleFormKeydown);
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute("inputlayout", this.constructor.inputLayout);
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    this.#updateInternalState(this.description, "description");
    this.#updateInternalState(this.supportPage, "support-link");
    this.#updateInternalState(this.label, "label");

    const activatedProperty = this.constructor.activatedProperty;
    // @ts-expect-error Typescript doesn't know easily this is correct.
    if (activatedProperty && changedProperties.has(activatedProperty)) {
      //  @ts-expect-error This is too dynamic for our typescript typings
      if (this[activatedProperty]) {
        this.#internals.states.add(activatedProperty);
      } else {
        this.#internals.states.delete(activatedProperty);
      }
    }

    if (
      // @ts-expect-error Typescript doesn't know easily this is correct.
      (activatedProperty && changedProperties.has(activatedProperty)) ||
      changedProperties.has("disabled") ||
      changedProperties.has("parentDisabled")
    ) {
      this.updateNestedElements();
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.#internals.setFormValue(this.value || "");
      this.#updateValidation();
    }

    if (changedProperties.has("pattern") || changedProperties.has("required")) {
      this.#updateValidation();
    }
  }

  #handleFormKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && this.#internals.form) {
      this.#internals.form.requestSubmit();
    }
  }

  #updateValidation() {
    if (this.inputEl) {
      // Copy validation state from the input element
      const inputValidity = this.inputEl.validity;
      const inputValidationMessage = this.inputEl.validationMessage;

      if (inputValidity.valid) {
        this.#internals.setValidity({});
      } else {
        this.#internals.setValidity(inputValidity, inputValidationMessage);
      }
    }
  }

  #updateInternalState(propVal: string | undefined, stateKey: string) {
    const internalStateKey = `has-${stateKey}`;
    const hasValue = !!(propVal || this.#hasSlottedContent.get(stateKey));

    if (this.#internals.states?.has(internalStateKey) == hasValue) {
      return;
    }

    if (hasValue) {
      this.#internals.states.add(internalStateKey);
    } else {
      this.#internals.states.delete(internalStateKey);
    }
  }

  // Form lifecycle methods:
  formDisabledCallback(disabled: boolean) {
    this.disabled = disabled;
  }

  formResetCallback() {
    this.value = this.getAttribute("value") || "";
    this.#internals.setFormValue(this.value || "");
  }

  formStateRestoreCallback(state: string) {
    this.value = state || "";
    this.#internals.setFormValue(this.value || "");
  }

  updateNestedElements() {
    if (this.isDisabled) {
      this.#internals.states.add("disabled");
    } else {
      this.#internals.states.delete("disabled");
    }

    for (const el of this.nestedEls) {
      if ("parentDisabled" in el) {
        el.parentDisabled =
          this.parentDisabled ||
          //  @ts-expect-error This is too dynamic for our typescript typings
          !this[this.constructor.activatedProperty] ||
          this.disabled;
      }
    }
  }

  get inputEl(): T {
    return this.renderRoot.querySelector("#input") as T;
  }

  get labelEl() {
    return this.renderRoot.querySelector("label");
  }

  get icon() {
    return this.renderRoot.querySelector(".icon");
  }

  get descriptionEl() {
    return this.renderRoot.querySelector("#description");
  }

  get nestedEls() {
    const nested = this.renderRoot.querySelector(".nested");
    if (nested instanceof HTMLSlotElement) {
      return nested.assignedElements() ?? [];
    }
    return [];
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

  get isInlineLayout() {
    return this.constructor.inputLayout == "inline";
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
    if (this.inputEl instanceof HTMLInputElement) {
      this.inputEl.select();
    }
  }

  blur() {
    this.inputEl.blur();
  }

  /**
   * Returns true if the element passes all validity constraints.
   */
  checkValidity(): boolean {
    return this.#internals.checkValidity();
  }

  /**
   * Returns true if the element passes all validity constraints and fires
   * an invalid event if it doesn't.
   */
  reportValidity(): boolean {
    return this.#internals.reportValidity();
  }

  /**
   * Sets a custom validation message.
   */
  setCustomValidity(message: string): void {
    if (message) {
      this.#internals.setValidity({ customError: true }, message);
    } else {
      this.#updateValidation();
    }
  }

  /**
   * Returns the element's validity state.
   */
  get validity(): ValidityState {
    return this.#internals.validity;
  }

  /**
   * Returns the element's validation message.
   */
  get validationMessage(): string {
    return this.#internals.validationMessage;
  }

  /**
   * Returns the element's willValidate state
   */
  get willValidate(): boolean {
    return this.#internals.willValidate;
  }

  inputTemplate() {
    throw new Error(
      "inputTemplate() must be implemented and provide the input element",
    );
  }

  inputStylesTemplate(): unknown {
    return nothing;
  }

  render() {
    return html`
      ${this.inputStylesTemplate()}
      <span class="label-wrapper">
        <label
          is="moz-label"
          id="label"
          part="label"
          for="input"
          shownaccesskey=${ifDefined(this.accessKey)}
          >${this.isInlineLayout
            ? this.inputTemplate()
            : ""}${this.labelTemplate()}</label
        >${this.hasDescription ? "" : this.supportLinkTemplate()}
      </span>
      ${this.descriptionTemplate()}
      ${!this.isInlineLayout ? this.inputTemplate() : ""}
      ${this.nestedFieldsTemplate()}
    `;
  }

  labelTemplate() {
    if (!this.label) {
      return "";
    }
    return html`<span class="text-container"
      >${this.iconTemplate()}<span class="text">${this.label}</span></span
    >`;
  }

  descriptionTemplate() {
    return html`
      <div class="description text-deemphasized">
        <span id="description" class="description-text">
          ${this.description ??
          html`<slot
            name="description"
            @slotchange=${this.handleSlotchange}
          ></slot>`}</span
        >${this.hasDescription ? this.supportLinkTemplate() : ""}
      </div>
    `;
  }

  iconTemplate() {
    if (this.iconSrc) {
      return html`<div
        class="icon contextual-icon"
        style=${styleMap({ "--icon-url": `url("${this.iconSrc}")` })}
        role="presentation"
      ></div>`;
    }

    return "";
  }

  supportLinkTemplate() {
    if (this.supportPage) {
      return html`<a
        is="moz-support-link"
        support-page=${this.supportPage}
        part="support-link"
        aria-describedby=${this.isInlineLayout ? nothing : "label description"}
      ></a>`;
    }
    return html`<slot
      name="support-link"
      @slotchange=${this.handleSlotchange}
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

  handleSlotchange(e: Event & { target: HTMLSlotElement }) {
    const propName = e.target.name;
    const hasSlottedContent = e.target
      .assignedNodes()
      .some(
        (node) =>
          node.textContent?.trim() ||
          (node instanceof Element && node.getAttribute("data-l10n-id")),
      );

    if (hasSlottedContent == this.#hasSlottedContent.get(propName)) {
      return;
    }

    this.#hasSlottedContent.set(propName, hasSlottedContent);
    this.requestUpdate();
  }
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
    label: { type: String, fluent: true },
    description: { type: String, fluent: true },
    iconSrc: { type: String },
  };

  label = "";
  description = "";
  iconSrc = "";

  constructor() {
    super();
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

  // Child classes will be able to override this function if appropriate
  focusOnKeyboardEvent(_e: KeyboardEvent) {
    this.focus();
  }

  textTemplate() {
    return html`<div
      class=${classMap({
        "text-content": true,
        "has-icon": this.iconSrc,
        "has-description": this.description,
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

    return html`<div
      class="icon contextual-icon"
      style=${styleMap({ "--icon-url": `url("${this.iconSrc}")` })}
      role="presentation"
    ></div>`;
  }

  descriptionTemplate() {
    if (!this.description) {
      return "";
    }
    return html`<span class="description text-deemphasized" id="description">
      ${this.description}
    </span>`;
  }

  static styles = [MozLitElement.styles, mozBoxCommonCss];
}
