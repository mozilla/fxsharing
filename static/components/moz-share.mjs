import "../dependencies/acorn-icon.mjs";
import { MozLitElement } from "../dependencies/lit-utils.mjs";
import { css, html } from "../dependencies/lit.all.mjs";
import "./moz-badge/moz-badge.mjs";
import "./moz-box-group/moz-box-group.mjs";
import MozBoxLink from "./moz-box-link/moz-box-link.mjs";
import "./moz-button-group/moz-button-group.mjs";
import "./moz-button/moz-button.mjs";
import "./moz-message-bar/moz-message-bar.mjs";
import MozPageHeader from "./moz-page-header/moz-page-header.mjs";
import "./moz-radio-group/moz-radio-group.mjs";
import { recordEvent } from "./telemetry.mjs";

// Acorn ships this as a mask-image icon, so it picks up currentColor the same
// way the old inline copy of default-favicon-light.svg did.
const DEFAULT_FAVICON_SRC = "/static/assets/defaultFavicon.svg";

/**
 * A single shared link, rendered as a moz-box-link so it inherits the Acorn
 * box styling (and therefore Nova) instead of hand-rolling a card.
 */
class ShareLink extends MozBoxLink {
  static properties = {
    link: { type: Object },
    faviconFailed: { type: Boolean, state: true },
  };

  static styles = [
    ...MozBoxLink.styles,
    css`
      :host {
        --box-icon-size: 40px;
        --box-icon-border-radius: var(--border-radius-small);
        --box-label-font-weight: var(--font-weight-semibold);
      }

      /* --box-icon-size sizes every .icon, but only the favicon wants to be
         big; the trailing open-in-new stays a normal UI icon. */
      .nav-icon {
        width: var(--icon-size);
        height: var(--icon-size);
      }

      /* Keep the favicon beside both lines of text rather than letting the URL
         wrap underneath it, which is what moz-box-common does by default. */
      .text-content.has-icon.has-description {
        grid-template-areas:
          "icon label"
          "icon description";
        row-gap: var(--space-xxsmall);
      }

      /* Titles and URLs are arbitrary length, so clip rather than wrap. Grid
         items need min-width: 0 before text-overflow can kick in. */
      .label,
      .description {
        display: block;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* moz-box-base tags this .text-deemphasized, but acorn's @import of
         text-and-typography.css is dropped when lit adopts the stylesheet, so
         spell the deemphasized styles out. */
      .description {
        color: var(--text-color-deemphasized);
        font-size: var(--font-size-small);
      }

      a:hover .label {
        color: var(--link-color);
      }

      @media (max-width: 964px) {
        :host {
          --box-icon-size: var(--size-item-medium);
        }
      }
    `,
  ];

  constructor() {
    super();
    this.addEventListener("click", () => recordEvent("link_click", {}));
  }

  willUpdate(changedProperties) {
    super.willUpdate?.(changedProperties);
    if (changedProperties.has("link")) {
      this.faviconFailed = false;
    }
    this.href = this.link?.url ?? "";
    this.label = this.link?.preview_title || this.link?.title || "";
    this.description = this.link?.url ?? "";
    // Always set, so moz-box-common lays out the icon column either way.
    this.iconSrc =
      (!this.faviconFailed && this.link?.favicon_url) || DEFAULT_FAVICON_SRC;
  }

  firstUpdated(changedProperties) {
    super.firstUpdated?.(changedProperties);
    // moz-box-link only sets target="_blank". Browsers imply noopener there but
    // not noreferrer, and we don't want to leak the share URL to link targets.
    this.renderRoot.querySelector("a")?.setAttribute("rel", "noopener noreferrer");
  }

  iconTemplate() {
    if (!this.link?.favicon_url || this.faviconFailed) {
      // No favicon, or the site's one 404s: fall back to the masked default.
      return super.iconTemplate();
    }
    // A favicon is full colour, so it has to be a real <img> — the <acorn-icon>
    // the base class uses would flatten it into a currentColor silhouette.
    return html`<img
      class="icon"
      src=${this.link.favicon_url}
      alt=""
      @error=${this.handleFaviconError}
    />`;
  }

  handleFaviconError() {
    this.faviconFailed = true;
  }

  render() {
    if (!this.link?.url) {
      return null;
    }
    return super.render();
  }
}
customElements.define("share-link", ShareLink);

/**
 * The share title, rendered as a moz-page-header.
 *
 * Two things the vendored component can't do on its own: Acorn doesn't inline
 * text-and-typography.css into component shadow roots, so its <h1> falls back
 * to the UA's 2em; and share titles are user-supplied, so the heading has to
 * clip rather than wrap. Both have to be fixed from inside the shadow root.
 */
class SharePageHeader extends MozPageHeader {
  static styles = [
    ...MozPageHeader.styles,
    css`
      .page-header-container,
      .heading {
        min-width: 0;
      }

      h1 {
        font-weight: var(--font-weight-heading);
        font-size: var(--font-size-heading-xlarge);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ];
}
customElements.define("share-page-header", SharePageHeader);

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

    /* Mixed off currentColor rather than the button tokens: Nova makes
       --button-background-color transparent, which erases the placeholder. */
    .skeleton-bar,
    .skeleton-favicon {
      --skeleton-color: color-mix(in srgb, currentColor 8%, transparent);
      --skeleton-highlight: color-mix(in srgb, currentColor 16%, transparent);
      background: linear-gradient(
        90deg,
        var(--skeleton-color) 0%,
        var(--skeleton-color) 30%,
        var(--skeleton-highlight) 50%,
        var(--skeleton-color) 70%,
        var(--skeleton-color) 100%
      );
      background-size: 300% 100%;
      animation: skeleton-shimmer 3.5s linear infinite;
    }

    .skeleton-bar {
      border-radius: var(--border-radius-circle);
    }

    /* Mirrors moz-box-group: one outlined container, rows split by a rule. */
    .skeleton-list {
      border: var(--border-width) solid var(--border-color);
      border-radius: var(--border-radius-medium);
      list-style: none;
      margin: 0;
      overflow: hidden;
      padding: 0;
    }

    .skeleton-item {
      display: flex;
      align-items: center;
      gap: var(--space-small);
      padding: var(--space-large);
    }

    .skeleton-item + .skeleton-item {
      border-block-start: var(--border-width) solid var(--border-color);
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
      gap: var(--space-xxsmall);
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
      margin-block-end: var(--size-item-large);
    }

    .share-footer {
      align-items: flex-start;
      border-top: var(--border-width) solid var(--border-color);
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

    .disclaimer acorn-icon {
      flex-shrink: 0;
      /* Match the paragraph it sits next to. */
      color: var(--text-color-deemphasized);
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
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-medium);
      padding: var(--space-large);
      max-width: 400px;
      background-color: var(--background-color-canvas);
      color: var(--text-color);
      box-shadow: var(--box-shadow-level-3);
    }

    #report-dialog form {
      display: flex;
      flex-direction: column;
      gap: var(--space-large);
    }

    #report-dialog::backdrop {
      background-color: var(--background-color-overlay);
    }

    .report-header {
      display: flex;
      align-items: center;
      gap: var(--space-small);
    }

    .report-header-icon {
      flex-shrink: 0;
      color: var(--icon-color);
    }

    .report-title {
      margin: 0;
      font-size: var(--font-size-root);
      font-weight: var(--font-weight-semibold);
    }

    :host(:not(.is-firefox)) .share-footer {
      margin-block-start: 0;
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
    reportForm: "#report-dialog form",
    shareLinks: { all: "share-link" },
  };

  static MAX_RETRIES = 10;
  static BASE_DELAY = 200;
  static MAX_DELAY = 20000;

  connectedCallback() {
    super.connectedCallback();
    this.init();
    this.classList.toggle(
      "is-firefox",
      document.documentElement.classList.contains("is-firefox"),
    );
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

    this.setupPollingForFavicons();
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

  get linksWithoutFavicons() {
    return this.flatLinks.filter((l) => !l.favicon_url);
  }

  async setupPollingForFavicons() {
    const shouldPollForFavicon = this.linksWithoutFavicons.length > 0;

    if (shouldPollForFavicon) {
      let attempt = 0;

      while (attempt < MozShare.MAX_RETRIES) {
        try {
          return await this.pollForFavicon();
        } catch {
          // Use exponential backoff for requesting the favicons
          const delay = Math.min(
            MozShare.MAX_DELAY,
            MozShare.BASE_DELAY * Math.pow(2, attempt),
          );
          const jitter = Math.random() * delay;

          await new Promise((resolve) => setTimeout(resolve, delay + jitter));

          attempt += 1;
        }
      }
    }
  }

  async pollForFavicon() {
    let params = new URLSearchParams();
    this.linksWithoutFavicons.forEach((l) => params.append("url", l.url));

    let response = await fetch(`/get_favicon_url?${params.toString()}`);

    let favicons = await response.json();
    if (favicons) {
      for (let [hostname, favicon_url] of Object.entries(favicons)) {
        let matchedHosts = this.linksWithoutFavicons.filter(
          (l) => new URL(l.url).hostname === hostname,
        );
        matchedHosts.forEach((l) => (l.favicon_url = favicon_url));
      }
      this.shareLinks.forEach((el) => el.requestUpdate());
      return;
    }

    throw new Error("Failed to get favicon on this attempt");
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

  // moz-button renders its <button> in a nested shadow root, so it can't act
  // as a native form submitter. Submit the form imperatively instead.
  submitReport() {
    this.reportForm.requestSubmit();
  }

  renderFooterLinks(loading = false) {
    return html`
      <div class="footer-links">
        <button
          class="footer-link"
          ?disabled=${loading}
          @click=${this.openReportDialog}
        >
          Report page
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
          <ul class="link-list skeleton-list">
            ${skeletonItems.map(
              () => html`
                <li class="skeleton-item">
                  <div class="skeleton-favicon"></div>
                  <div class="skeleton-text">
                    <div class="skeleton-bar skeleton-bar-title"></div>
                    <div class="skeleton-bar skeleton-bar-url"></div>
                  </div>
                </li>
              `,
            )}
          </ul>
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
          <moz-box-group class="link-list" type="list">
            ${this.flatLinks.map(
              (link) => html`<share-link .link=${link}></share-link>`,
            )}
          </moz-box-group>

          <slot name="promo"></slot>

          <footer class="share-footer">
            <div class="disclaimer">
              <acorn-icon
                src="/static/assets/users.svg"
                role="presentation"
              ></acorn-icon>
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
            <div class="report-header">
              <acorn-icon
                class="report-header-icon"
                src="/static/assets/info.svg"
                role="presentation"
              ></acorn-icon>
              <h2 class="report-title">Why are you reporting this page?</h2>
            </div>
            <moz-radio-group
              name="reason"
              value="copyright"
              aria-label="Why are you reporting this page?"
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
            <moz-button-group>
              <moz-button @click=${this.cancelReport}>Cancel</moz-button>
              <moz-button type="primary" @click=${this.submitReport}
                >Submit</moz-button
              >
            </moz-button-group>
          </form>
        </dialog>
      </div>
    `;
  }
}

customElements.define("moz-share", MozShare);
