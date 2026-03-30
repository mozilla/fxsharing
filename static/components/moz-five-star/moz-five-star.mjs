/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { ifDefined, html, classMap, css } from "../../dependencies/lit.all.mjs";
import { MozLitElement } from "../../dependencies/lit-utils.mjs";
/**
* @typedef {HTMLSpanElement} MozFiveStarRatingStarElement
*/
/**
* @typedef {{
*   rating: number
*   fill: 'full' | 'half' | 'empty'
* }} MozFiveStarRenderedStarState
*/
/**
* The visual representation is five stars, each of them either empty,
* half-filled or full. The fill state is derived from the rating,
* rounded to the nearest half.
*
* @tagname moz-five-star
* @property {number} rating - The rating out of 5.
* @property {string} title - The title text.
*/
export default class MozFiveStar extends MozLitElement {
  static properties = {
    rating: {
      type: Number,
      reflect: true
    },
    title: { type: String },
    selectable: { type: Boolean }
  };
  constructor() {
    super();
    /**
    * The initial rating that is also dynamically updated to the selected
    * rating if {@link selectable} is set to true.
    *
    * @type {number}
    */
    this.rating = 0;
    /**
    * Whether the stars in the component are selectable.
    *
    * @type {boolean}
    */
    this.selectable = false;
  }
  static get queries() {
    return {
      starEls: { all: ".rating-star" },
      starsWrapperEl: ".stars"
    };
  }
  /**
  * @returns {Array<MozFiveStarRenderedStarState>}
  */
  getStars() {
    /**
    * @type {Array<MozFiveStarRenderedStarState>}
    */
    let stars = [];
    let roundedRating = Math.round(this.rating * 2) / 2;
    for (let i = 1; i <= 5; i++) {
      if (i <= roundedRating) {
        stars.push({
          rating: i,
          fill: "full"
        });
      } else if (i - roundedRating === .5) {
        stars.push({
          rating: i,
          fill: "half"
        });
      } else {
        stars.push({
          rating: i,
          fill: "empty"
        });
      }
    }
    return stars;
  }
  /**
  * @param {MozFiveStarRatingStarElement} ratingStarElement
  * @returns
  */
  getStarElementRating(ratingStarElement) {
    const stringRating = ratingStarElement.getAttribute("rating") || "";
    return parseInt(stringRating, 10);
  }
  /**
  * @param {MouseEvent} e
  */
  onClick(e) {
    if (!this.selectable) {
      return;
    }
    /**
    * @type {MozFiveStarRatingStarElement}
    */
    const ratingStarElement = e.target;
    this.rating = this.getStarElementRating(ratingStarElement);
    this.dispatchEvent(new CustomEvent("select", { detail: { rating: this.rating } }));
  }
  render() {
    const { rating, selectable, title } = this;
    const starsTitle = title || selectable;
    return html`
      <div
        class="stars"
        role="img"
        title=${starsTitle ?? `Rated ${rating.toLocaleString(undefined, { maximumFractionDigits: 1 })} out of 5`} data-l10n-id=${ifDefined(starsTitle ? undefined : "moz-five-star-rating")} data-l10n-args=${ifDefined(starsTitle ? undefined : JSON.stringify({ rating }))}
      >
        ${this.getStars().map(({ rating: ratingValue, fill }) => {
      return html`<span
            class=${classMap({
        "rating-star": true,
        selectable
      })}
            fill=${fill}
            rating=${ratingValue}
            @click=${this.onClick}
            title=${ifDefined(selectable ? `Rate ${ratingValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} out of 5` : undefined)} data-l10n-id=${ifDefined(selectable ? "moz-five-star-rating-rate-text" : undefined)} data-l10n-args=${ifDefined(selectable ? JSON.stringify({ rating: ratingValue }) : undefined)}
          ></span>`;
    })}
      </div>
    `;
  }
  static styles = [...MozLitElement.styles ?? [], css`/* From chrome://global/content/elements/moz-five-star.css */
:host {
  display: flex;
  justify-content: space-between;
}

:host([hidden]) {
  display: none;
}

.stars {
  --rating-star-size: var(--icon-size);
  --rating-star-spacing: .3ch;
  display: inline-flex;
  align-content: center;
  justify-content: center;
}

.rating-star {
  display: inline-block;
  width: var(--rating-star-size);
  height: var(--rating-star-size);
  -webkit-mask-image: url("../../assets/rating-star.svg#empty");
  mask-image: url("../../assets/rating-star.svg#empty");
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: var(--rating-star-size) var(--rating-star-size);
  mask-size: var(--rating-star-size) var(--rating-star-size);
  padding-inline: calc(var(--rating-star-spacing) / 2);
  background-color: var(--icon-color);
  &:first-of-type {
    padding-inline-start: unset;
  }

  &:last-of-type {
    padding-inline-end: unset;
  }
}

.rating-star[fill="half"] {
  -webkit-mask-image: url("../../assets/rating-star.svg#half");

  mask-image: url("../../assets/rating-star.svg#half");
}

.rating-star[fill="full"], .rating-star.selectable:has( ~ .rating-star.selectable:hover), .rating-star.selectable:hover {
  -webkit-mask-image: url("../../assets/rating-star.svg#full");

  mask-image: url("../../assets/rating-star.svg#full");
}

.rating-star[fill="half"]:dir(rtl) {
  transform: scaleX(-1);
}

.rating-star.selectable {
  cursor: pointer;
}

`];
}
if (!customElements.get("moz-five-star")) { customElements.define("moz-five-star", MozFiveStar); }
