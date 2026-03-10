import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { MozLitElement } from "lit-utils";

import "~/widgets/moz-card/moz-card";

@customElement("summary-box")
export class SummaryBox extends MozLitElement {
  @property()
  iconSrc?: string;

  @property({ fluent: true })
  heading?: string;

  @property({ type: Number })
  value!: number;

  @property({ type: Boolean })
  indeterminate: boolean = false;

  @property()
  href?: string;

  @property({ fluent: true })
  description?: string;

  linkTemplate() {
    return html`
      <a href=${this.href} aria-description=${ifDefined(this.heading)}
        >${this.value}</a
      >
    `;
  }

  valueTemplate() {
    return html`<span aria-description=${ifDefined(this.heading)}
      >${this.value}</span
    >`;
  }

  render() {
    return html`
      <moz-card
        iconSrc=${ifDefined(this.iconSrc)}
        iconPosition="end"
        heading=${ifDefined(this.heading)}
      >
        <div class="content heading-xlarge">
          ${this.indeterminate
            ? html`<div class="indeterminate" aria-hidden="true"></div>`
            : this.href
              ? this.linkTemplate()
              : this.valueTemplate()}
        </div>
        ${when(
          this.description,
          () =>
            html`<div class="description text-deemphasized">
              ${this.description}
            </div>`,
        )}
      </moz-card>
    `;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        display: block;
      }

      moz-card {
        height: 100%;
      }

      .indeterminate {
        background: var(--box-shadow-color-lighter-layer-1);
        height: 1.5em;
        width: 1.5em;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "summary-box": SummaryBox;
  }
}
