/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, css } from "lit";
import { customElement, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import type { PropertyValues } from "lit";
import { MozLitElement } from "lit-utils";

/**
 * A button element that controls a named-deck. Set the target
 * named-deck's ID in the "deck" attribute and the button's selected state
 * will reflect the deck's state. When clicked, it will set the
 * view in the named-deck to the button's "name" attribute.
 */
@customElement("named-deck-button")
export class NamedDeckButton extends MozLitElement {
  static properties = {
    deckId: { type: String, attribute: "deck" },
    name: { type: String },
    selected: { type: Boolean, reflect: true },
    tabindexFromAttribute: {
      type: Number,
      attribute: "tabindex",
      mapped: true,
    },
  };

  @query("button")
  button!: HTMLButtonElement;

  deckId = "";
  name = "";
  selected = false;
  tabindexFromAttribute?: number;

  constructor() {
    super();
    this.addEventListener("click", this.handleClick);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.deckId) {
      throw new Error(
        "The attribute `deck` is mandatory for the component `named-deck-button`.",
      );
    }
    if (!this.name) {
      throw new Error(
        "The attribute `name` is mandatory for the component `named-deck-button`.",
      );
    }

    this.id = `${this.deckId}-button-${this.name}`;
    if (!this.hasAttribute("role")) {
      this.setAttribute("role", "tab");
    }
    this.setSelectedFromDeck();
    this.getRootNode().addEventListener(
      "view-changed",
      this.handleViewChanged,
      {
        capture: true,
      },
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.getRootNode().removeEventListener(
      "view-changed",
      this.handleViewChanged,
      {
        capture: true,
      },
    );
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has("selected")) {
      this.button.setAttribute("aria-selected", String(this.selected));
    }
  }

  get deck(): NamedDeck | null {
    const root = this.getRootNode() as Document | DocumentFragment | ShadowRoot;
    return root.querySelector(`#${this.deckId}`);
  }

  handleClick = () => {
    this.selectSelf();
  };

  selectSelf = () => {
    const deck = this.deck;
    if (deck) {
      deck.selectedViewName = this.name;
    }
  };

  handleViewChanged = (e: Event) => {
    if ((e.target as Element).id === this.deckId) {
      this.setSelectedFromDeck();
    }
  };

  setSelectedFromDeck() {
    const deck = this.deck;
    this.selected = deck ? deck.selectedViewName === this.name : false;
    if (this.selected) {
      this.dispatchEvent(
        new CustomEvent("button-group:selected", { bubbles: true }),
      );
    }
  }

  focus() {
    this.button.focus();
    this.selectSelf();
  }

  render() {
    return html`
      <button
        part="button"
        aria-selected=${this.selected}
        tabindex=${ifDefined(this.tabindexFromAttribute)}
      >
        <slot></slot>
      </button>
    `;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        border: 1px var(--border-color-interactive);
        border-style: solid none;
        display: flex;
        flex: 1;
      }

      :host([selected]) {
        border-block-start: 2px solid var(--color-accent-primary);
        color: var(--color-accent-primary);

        @media (forced-colors) {
          /* The values look inverted, but this is exacly what we want. */
          color: var(--button-background-color);
          background: var(--button-text-color);
        }
      }

      button {
        background: none;
        border: none;
        flex: 1;
        font: inherit;
        color: inherit;
        padding: var(--space-small);

        :host([selected]) & {
          padding-top: calc(var(--space-small) - 1px);
        }
      }
    `,
  ];
}

/**
 * A group of buttons with keyboard navigation support.
 * Wrapping named-deck-button elements in this will add tablist behavior.
 */
@customElement("button-group")
export class ButtonGroup extends MozLitElement {
  static properties = {
    orientation: { type: String, reflect: true },
  };

  orientation: "horizontal" | "vertical" = "horizontal";
  private _activeChild: Element | null = null;
  private observer?: MutationObserver;
  private walker?: TreeWalker;

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute("role", "tablist");

    if (this.orientation === "vertical") {
      this.setAttribute("aria-orientation", "vertical");
    }

    if (!this.observer) {
      this.observer = new MutationObserver((changes) => {
        for (const change of changes) {
          this.setChildAttributes(change.addedNodes);
          for (const node of change.removedNodes) {
            if (this.activeChild === node) {
              this.activeChild = this.firstElementChild;
            }
          }
          for (const node of change.addedNodes) {
            if (!this.activeChild) {
              this.activeChild = node as Element;
            }
          }
        }
      });
    }
    this.observer.observe(this, { childList: true });

    // eslint-disable-next-line wc/no-child-traversal-in-connectedcallback
    this.setChildAttributes(this.children);
    // eslint-disable-next-line wc/no-child-traversal-in-connectedcallback
    this.activeChild = this._activeChild || this.firstElementChild;

    this.addEventListener("button-group:selected", this.handleSelected);
    this.addEventListener("keydown", this.handleKeydown);
    this.addEventListener("mousedown", this.handleMousedown);
    this.getRootNode().addEventListener(
      "keypress",
      this.handleKeypress as EventListener,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.observer?.disconnect();
    this.removeEventListener("button-group:selected", this.handleSelected);
    this.removeEventListener("keydown", this.handleKeydown);
    this.removeEventListener("mousedown", this.handleMousedown);
    this.getRootNode().removeEventListener(
      "keypress",
      this.handleKeypress as EventListener,
    );
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has("orientation")) {
      if (this.orientation === "vertical") {
        this.setAttribute("aria-orientation", "vertical");
      } else {
        this.removeAttribute("aria-orientation");
      }
    }
  }

  setChildAttributes(nodes: Iterable<Node>) {
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node !== this.activeChild) {
        (node as Element).setAttribute("tabindex", "-1");
      }
    }
  }

  get activeChild() {
    return this._activeChild;
  }

  set activeChild(node: Element | null) {
    const prevActiveChild = this._activeChild;
    let newActiveChild: Element | null = null;

    if (node && this.contains(node)) {
      newActiveChild = node;
    } else {
      newActiveChild = this.firstElementChild;
    }

    if (!(newActiveChild instanceof Element)) {
      return;
    }

    this._activeChild = newActiveChild;

    if (newActiveChild) {
      newActiveChild.setAttribute("tabindex", "0");
    }

    if (prevActiveChild && prevActiveChild !== newActiveChild) {
      prevActiveChild.setAttribute("tabindex", "-1");
    }
  }

  get isVertical() {
    return this.orientation === "vertical";
  }

  private getNavigationKeys() {
    if (this.isVertical) {
      return {
        previousKey: "ArrowUp",
        nextKey: "ArrowDown",
      };
    }
    if (document.dir === "rtl") {
      return {
        previousKey: "ArrowRight",
        nextKey: "ArrowLeft",
      };
    }
    return {
      previousKey: "ArrowLeft",
      nextKey: "ArrowRight",
    };
  }

  handleSelected = (e: Event) => {
    this.activeChild = e.target as Element;
  };

  handleKeydown = (e: KeyboardEvent) => {
    const { previousKey, nextKey } = this.getNavigationKeys();
    if (e.key === previousKey || e.key === nextKey) {
      this.setAttribute("last-input-type", "keyboard");
      e.preventDefault();
      const oldFocus = this.activeChild;
      if (oldFocus) {
        this.getWalker().currentNode = oldFocus;
        let newFocus: Node | null = null;
        if (e.key === previousKey) {
          newFocus = this.getWalker().previousNode();
        } else {
          newFocus = this.getWalker().nextNode();
        }
        if (newFocus) {
          this.activeChild = newFocus as Element;
          this.dispatchEvent(new CustomEvent("button-group:key-selected"));
        }
      }
    }
  };

  handleMousedown = () => {
    this.setAttribute("last-input-type", "mouse");
  };

  handleKeypress = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      this.setAttribute("last-input-type", "keyboard");
    }
  };

  private getWalker() {
    if (!this.walker) {
      this.walker = document.createTreeWalker(this, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          const element = node as Element;
          const htmlElement = element as HTMLInputElement | HTMLButtonElement;
          if (
            (element as HTMLElement).hidden ||
            ("disabled" in htmlElement && htmlElement.disabled)
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          (element as HTMLElement).focus();
          const root = this.getRootNode() as Document | ShadowRoot;
          const activeElement = root.activeElement;
          return activeElement === element
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
    }
    return this.walker;
  }

  render() {
    return html`<slot></slot>`;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        display: flex;
        flex-direction: row;
      }
    `,
  ];
}

/**
 * A deck that shows one child at a time, indexed by the "name" attribute.
 * The named-deck-button element can control which view is shown.
 */
@customElement("named-deck")
export class NamedDeck extends MozLitElement {
  static properties = {
    selectedViewName: {
      type: String,
      attribute: "selected-view",
      reflect: true,
    },
    isTabbed: { type: Boolean, attribute: "is-tabbed", reflect: true },
  };

  selectedViewName = "";
  isTabbed = false;
  private observer?: MutationObserver;

  connectedCallback() {
    super.connectedCallback?.();

    if (this.selectedViewName) {
      this.setSelectedViewAttributes();
    } else {
      // eslint-disable-next-line wc/no-child-traversal-in-connectedcallback
      const firstView = this.firstElementChild;
      if (firstView) {
        this.selectedViewName = firstView.getAttribute("name") || "";
      }
    }

    this.observer = new MutationObserver(() => {
      this.setSelectedViewAttributes();
    });
    this.observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.observer?.disconnect();
  }

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (changedProperties.has("selectedViewName")) {
      this.setSelectedViewAttributes();
      this.dispatchEvent(new CustomEvent("view-changed"));
    }
  }

  private setSelectedViewAttributes() {
    for (const view of this.children) {
      const name = view.getAttribute("name");

      if (this.isTabbed) {
        if (this.id) {
          view.setAttribute("aria-labelledby", `${this.id}-button-${name}`);
        }
        view.setAttribute("role", "tabpanel");
      }

      if (name === this.selectedViewName) {
        view.setAttribute("slot", "selected");
      } else {
        view.setAttribute("slot", "");
      }
    }
  }

  render() {
    return html`<slot name="selected"></slot>`;
  }

  static styles = [MozLitElement.styles];
}

declare global {
  interface HTMLElementTagNameMap {
    "named-deck-button": NamedDeckButton;
    "button-group": ButtonGroup;
    "named-deck": NamedDeck;
  }
}
