/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import MozInputText from "../moz-input-text/moz-input-text";

export default class MozInputPassword extends MozInputText {
  inputTemplate() {
    return super.inputTemplate({ type: "password" });
  }
}
customElements.define("moz-input-password", MozInputPassword);

declare global {
  interface HTMLElementTagNameMap {
    "moz-input-password": MozInputPassword;
  }
}
