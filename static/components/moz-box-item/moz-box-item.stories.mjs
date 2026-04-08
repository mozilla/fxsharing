/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { html, ifDefined } from "../../dependencies/lit.all.mjs";
import "./moz-box-item.mjs";
import "../../dependencies/acorn-icon.mjs";
export default {
  title: "UI Widgets/Box Item",
  component: "moz-box-item",
  argTypes: {
    l10nId: {
      options: [
        "moz-box-item-label",
        "moz-box-item-label-long",
        "moz-box-item-label-description",
        "moz-box-item-label-description-long"
      ],
      control: { type: "select" }
    },
    iconSrc: {
      options: [
        "",
        new URL("../../assets/info.svg", import.meta.url).href,
        new URL("../../assets/highlights.svg", import.meta.url).href,
        new URL("../../assets/warning.svg", import.meta.url).href,
        new URL("../../assets/heart.svg", import.meta.url).href,
        new URL("../../assets/edit.svg", import.meta.url).href
      ],
      control: { type: "select" }
    }
  },
  parameters: {
    status: "in-development",
    fluent: `
moz-box-item-label =
  .label = I'm a box item
moz-box-item-label-long =
  .label = Lorem ipsum dolor sit amet, consectetur adipiscing elit
moz-box-item-label-description =
  .label = I'm a box item
  .description = Some description of the item
moz-box-item-label-description-long =
  .label = Lorem ipsum dolor sit amet, consectetur adipiscing elit
  .description = Etiam leo est, condimentum ac tristique vitae, viverra nec sem.
moz-box-delete-action =
  .aria-label = Delete I'm a box item
moz-box-edit-action =
  .aria-label = Edit I'm a box item
moz-box-toggle-action =
  .aria-label = Toggle I'm a box item
moz-box-more-action =
  .aria-label = More options for I'm a box item
    `
  }
};
const Template = ({ l10nId, iconSrc, slottedContent, layout, slottedActions, slottedActionsStart, supportPage }) => html`
  <style>
    .container {
      width: 400px;
    }

    .slotted {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      text-align: center;
    }

    img {
      width: 150px;
      margin-block-end: var(--space-large);
    }
  </style>
  <div class="container">
    <moz-box-item
      data-l10n-id=${l10nId}
      iconsrc=${ifDefined(iconSrc)}
      layout=${ifDefined(layout)}
      support-page=${ifDefined(supportPage)}
    >
      ${slottedContent ? html`<div class="slotted">
            <acorn-icon src="${new URL("../../assets/security-error.svg", import.meta.url).href}"></acorn-icon>
            <span>This is an example message</span>
            <span class="text-deemphasized">
              Message description would go down here
            </span>
          </div>` : ""}
      ${slottedActionsStart ? html`
            <moz-button
              iconsrc="${new URL("../../assets/delete.svg", import.meta.url).href}"
              data-l10n-id="moz-box-delete-action"
              slot="actions-start"
            ></moz-button>
          ` : ""}
      ${slottedActions ? html`
            <moz-button
              iconsrc="${new URL("../../assets/edit-outline.svg", import.meta.url).href}"
              data-l10n-id="moz-box-edit-action"
              type="ghost"
              slot="actions"
            ></moz-button>
            <moz-toggle
              slot="actions"
              pressed
              data-l10n-id="moz-box-toggle-action"
            ></moz-toggle>
            <moz-button
              iconsrc="../../assets/more.svg"
              data-l10n-id="moz-box-more-action"
              slot="actions"
            ></moz-button>
          ` : ""}
    </moz-box-item>
  </div>
`;
export const Default = Template.bind({});
Default.args = {
  l10nId: "moz-box-item-label",
  disabled: false,
  iconSrc: "",
  slottedContent: false,
  slottedActions: false,
  slottedActionsStart: false,
  supportPage: ""
};
export const WithDescription = Template.bind({});
WithDescription.args = {
  ...Default.args,
  l10nId: "moz-box-item-label-description"
};
export const WithIcon = Template.bind({});
WithIcon.args = {
  ...WithDescription.args,
  iconSrc: new URL("../../assets/highlights.svg", import.meta.url).href
};
export const WithSlottedContent = Template.bind({});
WithSlottedContent.args = { slottedContent: true };
export const LargeIconLayout = Template.bind({});
LargeIconLayout.args = {
  ...WithIcon.args,
  iconSrc: new URL("../../assets/info.svg", import.meta.url).href,
  layout: "large-icon"
};
export const MediumIconLayout = Template.bind({});
MediumIconLayout.args = {
  ...WithIcon.args,
  iconSrc: new URL("../../assets/info.svg", import.meta.url).href,
  layout: "medium-icon"
};
export const WithSlottedActions = Template.bind({});
WithSlottedActions.args = {
  ...Default.args,
  slottedActions: true
};
export const WithSlottedActionAtTheStart = Template.bind({});
WithSlottedActionAtTheStart.args = {
  ...Default.args,
  slottedActionsStart: true
};
export const WithSupportPage = Template.bind({});
WithSupportPage.args = {
  ...Default.args,
  supportPage: "test",
  iconSrc: new URL("../../assets/info.svg", import.meta.url).href
};
