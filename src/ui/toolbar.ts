import { Menu, setIcon } from "obsidian";
import type { BoardHost } from "./host";

/** The floating bar at the top-left of the board. */
export class Toolbar {
  private soloBtn?: HTMLButtonElement;
  private zoomBtn?: HTMLButtonElement;

  constructor(private host: BoardHost) {}

  build(parent: HTMLElement) {
    const bar = parent.createDiv({ cls: "sb-toolbar" });
    const button = (icon: string, label: string) => {
      const b = bar.createEl("button", { cls: "sb-tool" });
      setIcon(b.createSpan({ cls: "sb-tool-icon" }), icon);
      b.createSpan({ text: label });
      return b;
    };

    button("plus", "Add sound").onclick = (e) => {
      const menu = new Menu();
      this.host.menus.addItems(menu, undefined, false);
      menu.showAtMouseEvent(e);
    };
    button("square-dashed", "Add scene").onclick = () => this.host.importer.addScene();
    button("square", "Stop all").onclick = () => this.host.playback.stopAll();

    this.soloBtn = button("layers", "One scene at a time");
    this.soloBtn.setAttr("aria-label", "When on, starting a scene fades out the other scenes");
    this.soloBtn.onclick = async () => {
      const { plugin } = this.host;
      plugin.settings.exclusive = !plugin.settings.exclusive;
      await plugin.saveSettings();
      plugin.syncViews();
    };

    this.zoomBtn = bar.createEl("button", { cls: "sb-tool sb-zoom", attr: { "aria-label": "Reset zoom" } });
    this.zoomBtn.onclick = () => this.host.camera.resetZoom();

    this.sync();
  }

  /** Reflects the one-scene-at-a-time setting. */
  sync() {
    if (!this.soloBtn) return;
    const on = this.host.plugin.settings.exclusive;
    this.soloBtn.toggleClass("is-on", on);
    this.soloBtn.setAttr("aria-pressed", String(on));
  }

  setZoom(zoom: number) {
    this.zoomBtn?.setText(`${Math.round(zoom * 100)}%`);
  }
}
