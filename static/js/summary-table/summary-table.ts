import { html, css } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { styleMap } from "lit/directives/style-map.js";
import { classMap } from "lit/directives/class-map.js";
import { MozLitElement } from "lit-utils";

import "~/widgets/moz-button/moz-button";
import "~/widgets/moz-card/moz-card";

@customElement("summary-table")
export class SummaryTable extends MozLitElement {
  @property({ attribute: false })
  columnsData!: Array<[string | { l10nId: string }, number]>;

  @property({ type: Number })
  maxValue: undefined | number;

  @property({ fluent: true })
  heading?: string;

  @property({ fluent: true })
  description?: string;

  @property({ fluent: true, attribute: "total-label" })
  totalLabel!: string;

  @property({ fluent: true, attribute: "when-empty-label" })
  whenEmptyLabel!: string;

  @property({ attribute: false })
  totalValue?: number;

  @property()
  iconSrc?: string;

  @property({ type: Boolean })
  indeterminate = false;

  @state()
  showAll: boolean = false;

  renderCell(cell: number | string | { l10nId: string }) {
    if (typeof cell === "object") {
      return html`<td data-l10n-id=${cell.l10nId}></td>`;
    }
    return html`<td>${cell}</td>`;
  }

  private renderRow(
    row: [string | { l10nId: string }, number],
    isVisible: boolean,
  ) {
    const [key, value] = row;
    return html`
      <tr
        style=${styleMap({ "--value": value })}
        class=${classMap({ "row-is-hidden": !isVisible })}
      >
        <th>
          ${typeof key === "string"
            ? key
            : html`<span data-l10n-id=${key.l10nId}></span>`}
        </th>
        <td aria-hidden="true" class="graph-col">
          <div class="graph-bar-box">
            <div class="graph-bar"></div>
          </div>
        </td>
        <td class=" value-col">${value}</td>
      </tr>
    `;
  }

  render() {
    const isEmpty = this.columnsData.length === 0;

    return html`<moz-card
      iconSrc=${ifDefined(this.iconSrc)}
      iconPosition="end"
      heading=${ifDefined(this.heading)}
    >
      <div class="card-container">
        <p id="description">${this.description}</p>
        <table
          style=${styleMap({ "--max-value": this.maxValue })}
          aria-labelledby="description"
        >
          ${this.columnsData.map((row, i) =>
            this.renderRow(row, this.showAll || i < 5),
          )}
        </table>
        ${isEmpty
          ? html` <div class="empty-table">
              ${this.indeterminate
                ? html`
                    <div
                      class="empty-table-message"
                      data-l10n-id="summary-table-loading"
                    ></div>
                  `
                : html`
                    <div class="empty-table-message">
                      ${this.whenEmptyLabel}
                    </div>
                  `}
            </div>`
          : html`
              ${when(
                this.columnsData.length > 5,
                () =>
                  html` <moz-button
                    data-l10n-id=${this.showAll
                      ? "summary-table-show-less-button"
                      : "summary-table-show-all-button"}
                    data-l10n-args=${ifDefined(
                      this.showAll
                        ? null
                        : JSON.stringify({ rows: this.columnsData.length }),
                    )}
                    @click=${() => {
                      this.showAll = !this.showAll;
                    }}
                  ></moz-button>`,
              )}
              ${when(
                this.totalValue,
                () =>
                  html` <div class="total">
                    <div>${this.totalLabel}</div>
                    <div>${this.totalValue}</div>
                  </div>`,
              )}
            `}
      </div>
    </moz-card>`;
  }

  static styles = [
    MozLitElement.styles,
    css`
      :host {
        --bar-color: var(--color-red-10);
      }

      p {
        color: var(--text-color-deemphasized);
        margin-block: var(--space-xsmall);
      }

      moz-card {
        height: 100%;
      }

      .card-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-xsmall);
      }

      moz-button {
        width: 100%;
        margin-block: var(--space-small);
      }

      table {
        /* We use padding instead of gap so that hidden rows do not take up space */
        --cell-padding: var(--space-xxsmall) var(--space-xsmall);

        /* Grid gives us more freedom in how to size the columns */
        display: grid;
        grid-template-columns: fit-content(35%) 1fr auto;
        align-items: center;
      }

      tr {
        display: contents;
      }
      /* The row is hidden with visibility: hidden so that the grid uses it to
       * computate the sizes. */
      .row-is-hidden {
        visibility: hidden;
        & > * {
          /* tr has display: contents so we need to reduce its children instead */
          height: 0;
          padding: 0;
        }
      }

      th {
        font-weight: normal;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .graph-bar-box {
        position: relative;
        background: light-dark(var(--color-gray-20), var(--color-gray-70));
        height: 1rem;

        @media (forced-colors) {
          background: transparent;
          border: 1px solid CanvasText;
        }
      }

      .graph-bar {
        position: absolute;
        width: calc(var(--value) / var(--max-value) * 100%);
        height: 100%;
        background: var(--bar-color);

        @media (forced-colors) {
          background: CanvasText;
        }
      }

      .value-col {
        text-align: right;
      }

      .total {
        margin-block-start: auto;
        display: flex;
        justify-content: space-between;
        font-weight: var(--font-weight-bold);
        border-block-start: 1px solid
          var(--header-border-color, var(--border-color));
      }

      .empty-table {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: var(--space-xlarge) 0;
      }

      .empty-table-message {
        color: var(--text-color-deemphasized);
        text-align: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "summary-table": SummaryTable;
  }
}
