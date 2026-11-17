// gh-prs: a Pull requests side panel, and (props.button) its tab-bar toggle.
// One mod, two roles, the way workspace-chrome draws both the brand and the footer.
import { View } from "gpui-kit";
import { props } from "herdr";
import { ButtonView } from "./button.js";
import { PanelView } from "./panel.js";

export default class GhPrs extends View {
  init(_props, cx) {
    // Layout props arrive through herdr's props(), as the shipped mods read them.
    const own = props() ?? {};
    this.view = own.button ? new ButtonView() : new PanelView();
    this.view.init(own, cx);
  }

  render(cx) {
    return this.view.render(cx);
  }

  async close(cx) {
    await this.view.close?.(cx);
  }
}
