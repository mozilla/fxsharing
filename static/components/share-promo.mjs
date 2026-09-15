import { css, html } from "../dependencies/lit.all.mjs";
import MozPromo from "./moz-promo/moz-promo.mjs";

/**
 * The landing page hero, built on moz-promo.
 *
 * Three things the vendored component can't express on its own:
 *
 *  - The heading has to be the page's <h1>, not moz-promo's <h2>.
 *  - moz-promo's own `@import` of text-and-typography.css is a no-op, because
 *    lit adopts its styles as a constructable stylesheet and replaceSync()
 *    drops @import rules. So heading typography has to be spelled out here.
 *  - The artwork is a full-bleed hero, and it swaps for dark mode and for
 *    narrow viewports. A single imageSrc can't say that, so landing.css picks
 *    the art via --promo-image-url and we always render the container.
 *
 * Everything else — layout, the actions slot, and the Nova token overrides
 * keyed off moz-promo — comes from the base component.
 */
class SharePromo extends MozPromo {
  static styles = [
    ...MozPromo.styles,
    css`
      /* The surrounding moz-card already provides the surface. */
      :host {
        --promo-background-color: transparent;
        --promo-border-color: transparent;
        display: block;
      }

      .container {
        gap: var(--space-xxlarge);
        padding: var(--space-large);
      }

      .image-container {
        flex: 0 0 342px;
        align-self: center;
        max-width: 100%;
        aspect-ratio: 342 / 402;
        max-height: var(--size-layout-large);
        border-radius: var(--size-item-medium);
      }

      .text-container {
        gap: var(--space-medium);
        padding: 0 var(--space-xxlarge) 0 0;
      }

      .heading {
        font-weight: var(--font-weight-heading);
        font-size: var(--font-size-heading-xlarge);
      }

      /* Put the call to action on its own line under the copy rather than
         inline after it, which is what moz-promo does by default. */
      .message {
        display: block;
      }

      .actions-and-support-link-wrapper.active {
        margin-block-start: var(--space-large);
      }

      @media (max-width: 819px) {
        .container {
          flex-direction: column;
          padding: var(--space-xlarge);
        }

        .image-container {
          flex: 0 0 auto;
          width: 100%;
          aspect-ratio: 486 / 289;
          max-height: none;
        }

        .text-container {
          align-items: center;
          text-align: center;
          padding-inline-end: 0;
        }

        .actions-and-support-link-wrapper.active {
          justify-content: center;
        }
      }
    `,
  ];

  headingTemplate() {
    if (!this.heading) {
      return "";
    }
    return html`<h1 class="heading">${this.heading}</h1>`;
  }

  imageTemplate() {
    return html`<div class="image-container"></div>`;
  }
}

customElements.define("share-promo", SharePromo);
