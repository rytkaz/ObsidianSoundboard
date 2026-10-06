import { App, PluginSettingTab, Setting } from "obsidian";
import type SoundboardPlugin from "./main";
import { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  exclusive: false,
  fadeMs: 1500,
  soundFadeMs: 800,
  panByDefault: false,
};

export class SoundboardSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private owner: SoundboardPlugin
  ) {
    super(app, owner);
  }

  display() {
    const { containerEl } = this;
    const settings = this.owner.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("One scene at a time")
      .setDesc("Starting a scene fades out the other scenes on the same board.")
      .addToggle((t) =>
        t.setValue(settings.exclusive).onChange(async (v) => {
          settings.exclusive = v;
          await this.owner.saveSettings();
          this.owner.syncViews();
        })
      );

    new Setting(containerEl)
      .setName("Scene fade duration")
      .setDesc("Seconds used when a scene starts, pauses or is replaced. Set to 0 to turn fading off.")
      .addSlider((s) =>
        s
          .setLimits(0, 10, 0.5)
          .setValue(settings.fadeMs / 1000)
          .setDynamicTooltip()
          .onChange(async (v) => {
            settings.fadeMs = v * 1000;
            await this.owner.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sound fade duration")
      .setDesc("Seconds used when you play or pause a single sound or nested soundboard. Set to 0 to turn fading off.")
      .addSlider((s) =>
        s
          .setLimits(0, 5, 0.1)
          .setValue(settings.soundFadeMs / 1000)
          .setDynamicTooltip()
          .onChange(async (v) => {
            settings.soundFadeMs = v * 1000;
            await this.owner.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Drag on empty space")
      .setDesc(
        "The middle mouse button, or Space + drag, always pans. Holding Shift does the opposite of this setting."
      )
      .addDropdown((d) =>
        d
          .addOption("select", "Select nodes")
          .addOption("pan", "Pan the board")
          .setValue(settings.panByDefault ? "pan" : "select")
          .onChange(async (v) => {
            settings.panByDefault = v === "pan";
            await this.owner.saveSettings();
            this.owner.syncViews();
          })
      );
  }
}
