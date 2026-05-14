import { MozLitElement } from "../dependencies/lit-utils.mjs";
import { html, ifDefined, when, css } from "../dependencies/lit.all.mjs";
import "./moz-card/moz-card.mjs";
import "./moz-button/moz-button.mjs";
import "./moz-radio-group/moz-radio-group.mjs";
import "./moz-message-bar/moz-message-bar.mjs";

class MozLink extends MozLitElement {
  static properties = { link: { type: Object } };
  static styles = css`
    .clickable-container {
      display: flex;
      flex-direction: column;
      cursor: pointer;
      width: 308px;
      text-decoration: none;
      color: var(--text-color);
    }

    moz-card {
      width: 308px;
      height: 183px;
      position: relative;

      &::part(moz-card),
      &::part(content) {
        padding: 0;
      }
    }

    .og-image {
      position: absolute;
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      border-radius: var(--card-border-radius);
    }

    .title {
    }

    .url {
      color: var(--text-color-deemphasized);
      font-size: var(--font-size-small);
    }
  `;

  // connectedCallback() {
  //   super.connectedCallback();

  //   this.init();
  // }

  // async init() {
  //   const response = await fetch(this.link.url);
  //   console.log(response);
  //   // const share = await response.json();
  //   // this.share = share;
  // }

  render() {
    if (!this.link) {
      return null;
    }

    return html`<a
      class="clickable-container"
      href=${this.link.url}
      target="_blank"
    >
      <moz-card
        ><img class="og-image" src=${this.link.opengraph?.image ?? ""}
      /></moz-card>
      <span class="title"
        >${this.link.opengraph?.title ?? this.link.title}</span
      >
      <span class="url">${this.link.url}</span>
    </a>`;
  }
}
customElements.define("moz-link", MozLink);

class MozShare extends MozLitElement {
  static properties = {
    shortcode: { type: String },
    share: { type: Object },
    reportSubmitted: { type: Boolean, state: true },
    reportError: { type: Boolean, state: true },
    reportThrottled: { type: Boolean, state: true },
  };
  static styles = css`
    .share {
      display: flex;
      gap: var(--space-xxlarge);
      flex-wrap: wrap;
    }

    .kit-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      max-width: 267px;

      #kit {
        width: 163px;
        height: 188px;
        transform: scale(-1, 1);
        /* filter: grayscale(100%); */
      }
    }

    moz-card {
      display: flex;

      .container {
        padding-inline: var(--space-xxlarge);
        margin-inline: var(--space-xxlarge);
      }

      .link-container {
        display: grid;
        gap: var(--space-xxlarge);
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-small);
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
      margin-top: var(--space-large);
    }
  `;

  static queries = {
    copyButton: "#copy-button",
    reportDialog: "#report-dialog",
    reportForm: "#report-form",
  };

  get dateFormatted() {
    if (!this.share?.created_at) {
      return null;
    }

    let date = new Date(this.share.created_at);

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  updated(changedProperties) {
    if (changedProperties.has("shortcode") && this.shortcode) {
      this.init();
    }
  }

  async init() {
    try {
      const response = await fetch(`/api/v1/share/${this.shortcode}`);
      if (!response.ok) {
        throw new Error(`Failed to load share: ${response.status}`);
      }
      this.share = await response.json();
    } catch (e) {
      console.error(e);
    }
  }

  copyLink() {
    navigator.clipboard.writeText(location.href);
    this.copyButton.textContent = "Link Copied";
    this.copyButton.iconSrc = "/static/assets/check-filled.svg";

    setTimeout(() => {
      this.copyButton.textContent = "Copy Link";
      this.copyButton.iconSrc = "";
    }, 5000);
  }

  copyButtonTemplate() {
    return html`<moz-button id="copy-button" @click=${this.copyLink}
      >Copy Link</moz-button
    >`;
  }

  openReportDialog() {
    this.reportDialog.showModal();
  }

  cancelReport() {
    this.reportDialog.close();
  }

  async submitReport() {
    const reason = this.reportForm.querySelector("moz-radio-group").value;

    this.reportForm.reset();
    this.reportDialog.close();

    try {
      const response = await fetch(`/api/v1/report/${this.shortcode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (response.status === 429) {
        this.reportThrottled = true;
        return;
      }
      if (!response.ok) {
        throw new Error(`Report failed: ${response.status}`);
      }
      this.reportSubmitted = true;
    } catch (e) {
      console.error(e);
      this.reportError = true;
    }
  }

  reportConfirmationTemplate() {
    if (this.reportSubmitted) {
      return html`<moz-message-bar
        type="success"
        message="Your report has been submitted"
        dismissable
        @message-bar:user-dismissed=${() => (this.reportSubmitted = false)}
      ></moz-message-bar>`;
    }
    if (this.reportThrottled) {
      return html`<moz-message-bar
        type="warning"
        message="Too many reports. Try later."
        dismissable
        @message-bar:user-dismissed=${() => (this.reportThrottled = false)}
      ></moz-message-bar>`;
    }
    if (this.reportError) {
      return html`<moz-message-bar
        type="error"
        message="Something went wrong. Please try again."
        dismissable
        @message-bar:user-dismissed=${() => (this.reportError = false)}
      ></moz-message-bar>`;
    }
    return null;
  }

  reportButtonTemplate() {
    return html`<moz-button id="report-button" @click=${this.openReportDialog}
      >Report unsafe page</moz-button
    >`;
  }

  reportDialogTemplate() {
    return html`<dialog id="report-dialog">
      <form id="report-form">
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
          <moz-button @click=${this.cancelReport}>Cancel</moz-button>
          <moz-button type="primary" @click=${this.submitReport}
            >Submit</moz-button
          >
        </div>
      </form>
    </dialog>`;
  }

  render() {
    if (!this.share) {
      return null;
    }

    return html`<div class="share">
      <div class="kit-container">
        <img id="kit" src="/static/assets/fxsharing-kit.png" />
        <h2>Share this link</h2>
        <p>
          Send an easy-to-use page with all the links in ${this.share.title} to
          anyone.
        </p>
        <p>
          <a target="_blank" href="https://www.firefox.com/en-US/landing/get/"
            >Download Firefox</a
          >
          to create your own shared links.
        </p>
        <div class="actions">
          ${this.copyButtonTemplate()}
          ${this.reportButtonTemplate()}
        </div>
        ${this.reportConfirmationTemplate()}
        ${this.reportDialogTemplate()}
      </div>
      <moz-card
        ><div class="container">
          <h1>${this.share.title}</h1>
          <p>From {email} - ${this.dateFormatted}</p>
          <div class="link-container">
            ${this.share.links.map(
              (link) => html`<moz-link .link=${link}></moz-link>`,
            )}
          </div>
        </div></moz-card
      >
    </div>`;
  }
}

customElements.define("moz-share", MozShare);
