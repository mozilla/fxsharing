import { MozLitElement } from "../dependencies/lit-utils.mjs";
import { html, css } from "../dependencies/lit.all.mjs";
import "./moz-button/moz-button.mjs";
import "./moz-card/moz-card.mjs";
import "./moz-radio-group/moz-radio-group.mjs";
import "./moz-message-bar/moz-message-bar.mjs";

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
    }

    .link-anchor {
      align-items: center;
      color: var(--text-color);
      display: flex;
      gap: var(--space-large);
      padding: var(--space-large);
      text-decoration: none;
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
      margin-block: 0 var(--space-small);
    }

    .link-url {
      margin: 0;
    }

    @media (max-width: 964px) {
      .favicon-container picture {
        width: 24px;
        height: 24px;
      }

      .favicon {
        width: 24px;
      }
    }
  `;

  handleFaviconError() {
    this.faviconError = true;
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
  };

  static styles = css`
    .share-page {
      width: 100%;
      padding-block-start: var(--space-xlarge);
    }

    .share-content {
      box-sizing: border-box;
      max-width: 964px;
      min-width: 380px;
      margin-inline: auto;
      padding-inline: var(--space-medium);
    }

    .share-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      margin-block-end: var(--space-xlarge);
    }

    .logo {
      position: absolute;
      width: 50px;
      object-fit: contain;
      transform: translateX(-300%);
    }

    .share-title {
      margin-block: 0 var(--space-small);
      font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-xlarge);
      color: var(--text-color);
    }

    .share-meta {
      display: flex;
      align-items: center;
      gap: var(--space-small);
      color: var(--text-color);
    }

    .link-count {
      display: flex;
      align-items: center;
      gap: var(--space-small);
    }

    .link-count picture {
      display: flex;
    }

    .link-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-large);
    }

    .share-footer {
      align-items: flex-start;
      border-top: 1px solid var(--border-color-card);
      display: flex;
      justify-content: space-between;
      margin-block-start: var(--size-item-xlarge);
      padding-block: var(--size-item-large);
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
      gap: var(--space-large);
      align-items: center;
      flex: 0.9;
      justify-content: space-between;
    }


    .footer-link {
      color: var(--text-color-deemphasized);
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
      background-color: rgba(0, 0, 0, 0.5);
    }

    .report-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-small);
      margin-block-start: var(--space-large);
    }

    @media (max-width: 1300px) {
      .share-content {
        max-width: 720px;
      }

      .share-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .logo {
        inset-block-start: 50%;
        inset-inline-end: 0;
        transform: translateY(-50%);
      }

      .header-actions {
        margin-block-start: var(--space-xlarge);
      }
    }

    @media (max-width: 964px) {
      .logo {
        width: var(--size-item-large);
      }

      .share-content {
        max-width: 100%;
        padding-inline: var(--size-item-large);
      }

      .link-list {
        gap: var(--space-medium);
      }

      .share-footer {
        flex-direction: column;
        gap: var(--space-large);
      }

      .footer-links {
        flex-direction: column;
        align-items: flex-start;
      }

      .footer-link {
        text-align: start;
      }
    }
  `;

  static queries = {
    copyButton: "#copy-button",
    reportDialog: "#report-dialog",
  };

  get expiryText() {
    if (!this.share?.expires_at) {
      return null;
    }
    const expiry = new Date(this.share.expires_at);
    const now = new Date();
    const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (days <= 0) {
      return "Expired";
    }
    if (days === 1) {
      return "Expiring today";
    }
    return `Expiring in ${days} days`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  init() {
    const dataEl = this.querySelector("script[type='application/json']");
    try {
      this.share = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error(e);
    }
  }

  copyLink() {
    navigator.clipboard.writeText(location.href);
    this.copyButton.textContent = "Link Copied";
    this.copyButton.iconSrc = "/static/assets/check-filled.svg";
    setTimeout(() => {
      this.copyButton.textContent = "Copy link";
      this.copyButton.iconSrc = "/static/assets/edit-copy.svg";
    }, 5000);
  }

  openReportDialog() {
    this.reportDialog.showModal();
  }

  cancelReport() {
    this.reportDialog.close();
  }

  render() {
    if (!this.share) {
      return null;
    }

    const expiryText = this.expiryText;
    const linkCount = this.share.links?.length ?? 0;

    return html`
      <div class="share-page">
        <div class="share-content">
          <div class="share-header">
            <img class="logo" src="/static/assets/logo.svg" alt="" />
            <div>
              <h1 class="share-title">${this.share.title}</h1>
              <div class="share-meta">
                <span class="link-count">
                    <picture>
                      <source
                        srcset="/static/assets/folder-dark.svg"
                        media="(prefers-color-scheme: dark)"
                      />
                      <img src="/static/assets/folder-light.svg" alt="" />
                    </picture>
                    ${linkCount}
                  </span>
                ${expiryText
                  ? html`<span aria-hidden="true">·</span
                      ><span>${expiryText}</span>`
                  : ""}
              </div>
            </div>
            <div class="header-actions">
              <moz-button
                id="copy-button"
                iconsrc="/static/assets/edit-copy.svg"
                @click=${this.copyLink}
                >Copy link</moz-button
              >
            </div>
          </div>
          <div class="link-list">
            ${this.share.links.map(
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
            <div class="footer-links">
              <button class="footer-link" @click=${this.openReportDialog}>
                Report unsafe page
              </button>
              <a class="footer-link" href="#">Terms of use</a>
              <a class="footer-link" href="#">Acceptable use policy</a>
            </div>
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
