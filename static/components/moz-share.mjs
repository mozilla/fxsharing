import { MozLitElement } from "../dependencies/lit-utils.mjs";
import { css, html } from "../dependencies/lit.all.mjs";
import "./moz-button/moz-button.mjs";
import "./moz-card/moz-card.mjs";
import "./moz-message-bar/moz-message-bar.mjs";
import "./moz-radio-group/moz-radio-group.mjs";
import { recordEvent } from "./telemetry.mjs";

function faviconUrl(link) {
  if (link.favicon_url) {
    return link.favicon_url;
  }
  try {
    return new URL(link.url).origin + "/favicon.ico";
  } catch {
    return "/static/assets/default-favicon-light.svg";
  }
}

class MozLink extends MozLitElement {
  static properties = {
    link: { type: Object },
    faviconError: { type: Boolean, state: true },
  };

  static styles = css`
    moz-card {
      --card-padding: 0;
      --card-background-color: light-dark(rgba(255, 255, 255, 0.4), rgba(21, 20, 26, 0.4));
      --card-background-color-hover: light-dark(rgba(21, 20, 26, 0.07), rgba(251, 251, 254, 0.07));
      --card-border-radius: var(--border-radius-medium);
    }

    .link-anchor {
      align-items: center;
      border-radius: var(--border-radius-medium);
      color: var(--text-color);
      display: flex;
      gap: var(--space-large);
      padding: var(--space-large);
      text-decoration: none;
    }

    .link-anchor:hover {
      background-color: var(--card-background-color-hover);
    }

    .link-anchor:hover .link-title {
      color: var(--link-color);
    }

    .link-anchor:focus-visible {
      background-color: var(--card-background-color-hover);
      outline: var(--focus-outline);
      outline-offset: var(--focus-outline-offset);
      border-radius: var(--border-radius-medium);
    }

    .favicon-container picture {
      width: 40px;
      height: 40px;
    }

    .favicon {
      border-radius: var(--border-radius-small);
      width: 40px;
    }

    .link-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .link-title {
      font-size: var(--font-size-root);
      font-weight: var(--font-weight-semibold);
      margin-block: 0 var(--space-xsmall);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .link-url {
      color: var(--text-color-deemphasized);
      font-size: var(--font-size-xsmall);
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .external-icon {
      width: var(--size-item-xsmall);
      height: var(--size-item-xsmall);
      flex-shrink: 0;
    }

    @media (max-width: 964px) {
      .favicon-container picture {
        width: var(--size-item-medium);
        height: var(--size-item-medium);
      }

      .favicon {
        width: var(--size-item-medium);
      }
    }
  `;

  handleFaviconError() {
    this.faviconError = true;
  }

  handleLinkClick() {
    recordEvent("link_click", {});
  }

  render() {
    if (!this.link?.url) {
      return null;
    }

    const title = this.link.preview_title || this.link.title;

    return html`
      <moz-card>
        <a
          class="link-anchor"
          href=${this.link.url}
          target="_blank"
          rel="noopener noreferrer"
          @click=${this.handleLinkClick}
        >
          <div class="favicon-container">
            <picture>
              ${this.faviconError
                ? html`<source
                    srcset="/static/assets/default-favicon-dark.svg"
                    media="(prefers-color-scheme: dark)"
                  />`
                : ""}
              <img
                class="favicon"
                src=${this.faviconError
                  ? "/static/assets/default-favicon-light.svg"
                  : faviconUrl(this.link)}
                alt=""
                @error=${this.handleFaviconError}
              />
            </picture>
          </div>
          <div class="link-text">
            <p class="link-title">${title}</p>
            <p class="link-url">${this.link.url}</p>
          </div>
          <picture aria-hidden="true">
            <source
              srcset="/static/assets/open-dark.svg"
              media="(prefers-color-scheme: dark)"
            />
            <img
              class="external-icon"
              src="/static/assets/open-light.svg"
              alt=""
            />
          </picture>
        </a>
      </moz-card>
    `;
  }
}
customElements.define("moz-link", MozLink);

class MozShare extends MozLitElement {
  static properties = {
    share: { type: Object },
    loading: { type: Boolean },
    count: { type: Number },
  };

  static styles = css`
    @keyframes skeleton-shimmer {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }

    .skeleton-bar,
    .skeleton-favicon {
      background: linear-gradient(
        90deg,
        var(--button-background-color) 0%,
        var(--button-background-color) 30%,
        var(--button-background-color-hover) 50%,
        var(--button-background-color) 70%,
        var(--button-background-color) 100%
      );
      background-size: 300% 100%;
      animation: skeleton-shimmer 3.5s linear infinite;
    }

    .skeleton-bar {
      border-radius: var(--border-radius-circle);
    }

    .skeleton-title {
      height: var(--size-item-medium);
      width: 100%;
      margin-block-end: var(--space-small);
    }

    .skeleton-meta {
      height: var(--font-size-large);
      width: 70%;
    }

    .skeleton-item {
      display: flex;
      align-items: center;
      gap: var(--space-large);
      padding: var(--space-large);
      background: light-dark(
        var(--color-white-alpha-20),
        var(--color-black-alpha-20)
      );
      border: var(--border-width) solid var(--border-color-card);
      border-radius: var(--border-radius-small);
      box-shadow: var(--box-shadow-card);
    }

    .skeleton-favicon {
      width: 40px;
      height: 40px;
      border-radius: var(--border-radius-small);
      flex-shrink: 0;
    }

    .skeleton-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-xsmall);
    }

    .skeleton-bar-title {
      height: var(--font-size-xlarge);
      width: 100%;
    }

    .skeleton-bar-url {
      height: var(--font-size-small);
      width: 100%;
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-bar,
      .skeleton-favicon {
        animation: none;
      }
    }

    :host {
      color: var(--text-color);
      display: flex;
      flex-direction: column;
      min-height: 100%;
      width: 100%;
    }

    .share-page {
      display: flex;
      flex: 1;
      flex-direction: column;
      padding-block-start: var(--space-xlarge);
      width: 100%;
    }

    .share-content {
      box-sizing: border-box;
      display: flex;
      flex: 1;
      flex-direction: column;
      width: 100%;
      max-width: 964px;
      min-width: 280px;
      margin-inline: auto;
      padding-inline: var(--size-item-large);
    }

    .link-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-medium);
      margin-block-end: 50px;
    }

    .share-footer {
      align-items: flex-start;
      border-top: var(--border-width) solid var(--border-color-card);
      display: flex;
      justify-content: center;
      gap: var(--size-item-xlarge);
      margin-block-start: auto;
      padding-block: var(--size-item-large);
      flex-direction: column;
    }

    .disclaimer {
      align-items: flex-start;
      display: flex;
      gap: var(--space-small);
      max-width: 250px;
    }

    .disclaimer picture {
      display: flex;
      flex-shrink: 0;
    }

    .disclaimer p {
      font-size: var(--font-size-small);
      color: var(--text-color-deemphasized);
      margin: 0;
    }

    .footer-links {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-large);
      justify-content: space-between;
      padding-inline-start: var(--space-xlarge);
    }

    .footer-link {
      color: var(--text-color-deemphasized);
      font-size: var(--font-size-small);
      font-weight: var(--font-weight);
      text-decoration: underline;
      text-align: center;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
    }

    .footer-link:hover {
      color: var(--text-color);
    }

    #report-dialog {
      border: none;
      border-radius: var(--border-radius-medium);
      padding: var(--space-xxlarge);
      max-width: 400px;
    }

    #report-dialog::backdrop {
      background-color: var(--background-color-overlay);
    }

    .report-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-small);
      margin-block-start: var(--space-large);
    }

    @media (min-width: 516px) {
      .share-footer {
        flex-direction: row;
      }

      .footer-links {
         padding-inline-start: 0;
      }
    }

    @media (min-width: 965px) {
      .share-content {
        padding-inline: var(--space-medium);
      }

      .link-list {
        gap: var(--space-large);
      }

      .share-footer {
        justify-content: space-between;
        gap: 0;
        padding-block: var(--size-item-large) 42px;
      }

      .footer-links {
        flex-direction: row;
        align-items: center;
        flex: 0.9;
      }
    }
  `;

  static queries = {
    reportDialog: "#report-dialog",
  };

  connectedCallback() {
    super.connectedCallback();
    this.init();
    this._copyBtn = document.getElementById("copy-button");
    if (this._copyBtn) {
      this._onCopyClick = () => this.copyLink();
      this._copyBtn.addEventListener("click", this._onCopyClick);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._copyBtn) {
      this._copyBtn.removeEventListener("click", this._onCopyClick);
    }
  }

  init() {
    const dataEl = this.querySelector("script[type='application/json']");
    if (!dataEl) {
      return;
    }
    try {
      this.share = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * We currently only show a flattened list of links so we have to flatten all
   * nested shares/links into an array of links for now.
   */
  get flatLinks() {
    let links = [];
    let shares = [this.share];
    while (shares.length) {
      let share = shares.shift();
      for (let link of share.links) {
        if (link.links) {
          shares.push(link);
        } else {
          links.push(link);
        }
      }
    }
    return links;
  }

  copyLink() {
    navigator.clipboard.writeText(location.href);
    recordEvent("copy_link", {});
    if (this._copyBtn) {
      this._copyBtn.textContent = "Link Copied";
      this._copyBtn.iconSrc = "/static/assets/check-filled.svg";
      setTimeout(() => {
        this._copyBtn.textContent = "Copy sharable link";
        this._copyBtn.iconSrc = "/static/assets/edit-copy.svg";
      }, 5000);
    }
  }

  openReportDialog() {
    recordEvent("report_dialog_open", {});
    this.reportDialog.showModal();
  }

  cancelReport() {
    this.reportDialog.close();
  }

  renderFooterLinks(loading = false) {
    return html`
      <div class="footer-links">
        <button
          class="footer-link"
          ?disabled=${loading}
          @click=${this.openReportDialog}
        >
          Report unsafe page
        </button>
        <a
          class="footer-link"
          href="https://www.mozilla.org/en-US/about/legal/terms/services/"
          target="_blank"
          @click=${() => recordEvent("tou_click", {})}
          >Terms of use</a
        >
        <a
          class="footer-link"
          href="https://www.mozilla.org/en-US/about/legal/acceptable-use/"
          target="_blank"
          @click=${() => recordEvent("aup_click", {})}
          >Acceptable use policy</a
        >
      </div>
    `;
  }

  renderSkeleton() {
    const skeletonItems = Array.from({ length: this.count || 8 });
    return html`
      <div class="share-page">
        <div class="share-content">
          <div class="link-list" role="list">
            ${skeletonItems.map(
              () => html`
                <div class="skeleton-item" role="listitem">
                  <div class="skeleton-favicon"></div>
                  <div class="skeleton-text">
                    <div class="skeleton-bar skeleton-bar-title"></div>
                    <div class="skeleton-bar skeleton-bar-url"></div>
                  </div>
                </div>
              `,
            )}
          </div>
          <footer class="share-footer">${this.renderFooterLinks(true)}</footer>
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return this.renderSkeleton();
    }

    return html`
      <div class="share-page">
        <div class="share-content">
          <div class="link-list">
            ${this.flatLinks.map(
              (link) => html`<moz-link .link=${link}></moz-link>`,
            )}
          </div>

          <footer class="share-footer">
            <div class="disclaimer">
              <picture>
                <source
                  srcset="/static/assets/users-dark.svg"
                  media="(prefers-color-scheme: dark)"
                />
                <img src="/static/assets/users-light.svg" alt="" />
              </picture>
              <p>
                Created by a Firefox user. Mozilla does not review or approve
                these links. Open links only if you trust the sender.
              </p>
            </div>
            ${this.renderFooterLinks()}
          </footer>
        </div>

        <dialog id="report-dialog">
          <form method="post" action="/report/${this.share.shortcode}">
            <moz-radio-group
              label="Why are you reporting this page?"
              name="reason"
              value="copyright"
            >
              <moz-radio
                value="copyright"
                label="Contains copyright protected content"
              ></moz-radio>
              <moz-radio
                value="harmful"
                label="Contains sexual, violent, or other harmful content"
              ></moz-radio>
              <moz-radio
                value="spam"
                label="Contains spam or malware"
              ></moz-radio>
              <moz-radio value="other" label="Other"></moz-radio>
            </moz-radio-group>
            <div class="report-actions">
              <button type="button" @click=${this.cancelReport}>Cancel</button>
              <button type="submit">Submit</button>
            </div>
          </form>
        </dialog>
      </div>
    `;
  }
}

customElements.define("moz-share", MozShare);
