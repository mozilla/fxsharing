import { MozLitElement } from "../dependencies/lit-utils.mjs";
import { html, ifDefined, when, css } from "../dependencies/lit.all.mjs";
import "./moz-card/moz-card.mjs";
import "./moz-button/moz-button.mjs";

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
  static properties = { share: { type: Object } };
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
  `;

  static queries = { copyButton: "#copy-button" };

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

  connectedCallback() {
    super.connectedCallback();

    this.init();
  }

  async init() {
    const response = await fetch("/api" + location.pathname);
    const share = await response.json();
    this.share = share;
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
        ${this.copyButtonTemplate()}
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
