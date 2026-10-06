import { describe, expect, it, vi } from "vitest";
import { SoundboardSettingTab } from "../src/settings";
import { createPlugin } from "./helpers/fixture";
import { App, Setting } from "./mocks/obsidian";

async function show() {
  const app = new App();
  const plugin = await createPlugin(app, { fadeMs: 1500, soundFadeMs: 800 });
  plugin.settings.exclusive = false;
  const sync = vi.spyOn(plugin, "syncViews");
  const tab = new SoundboardSettingTab(app as never, plugin);
  tab.display();
  return { plugin, sync, tab };
}

describe("settings tab", () => {
  it("lists the four settings", async () => {
    await show();
    expect(Setting.all.map((s) => s.name)).toEqual([
      "One scene at a time",
      "Scene fade duration",
      "Sound fade duration",
      "Drag on empty space",
    ]);
  });

  it("redrawing replaces the old content", async () => {
    const { tab } = await show();
    tab.display();
    expect(tab.containerEl.querySelectorAll("div").length).toBe(4);
  });

  it("shows the current values", async () => {
    const { plugin } = await show();
    expect(Setting.named("One scene at a time").controls[0].value).toBe(false);
    expect(Setting.named("Scene fade duration").controls[0].value).toBe(1.5);
    expect(Setting.named("Sound fade duration").controls[0].value).toBe(0.8);
    expect(Setting.named("Drag on empty space").controls[0].value).toBe("select");
    expect(plugin.settings.exclusive).toBe(false);
  });

  it("the toggle saves and tells open boards", async () => {
    const { plugin, sync } = await show();
    await Setting.named("One scene at a time").controls[0].handler(true);
    expect(plugin.settings.exclusive).toBe(true);
    expect(await plugin.loadData()).toMatchObject({ exclusive: true });
    expect(sync).toHaveBeenCalled();
  });

  it("the fade sliders work in seconds and store milliseconds", async () => {
    const { plugin } = await show();
    const scene = Setting.named("Scene fade duration").controls[0];
    const single = Setting.named("Sound fade duration").controls[0];
    expect(scene.limits).toEqual([0, 10, 0.5]);
    expect(single.limits).toEqual([0, 5, 0.1]);

    await scene.handler(2.5);
    await single.handler(0);
    expect(plugin.settings.fadeMs).toBe(2500);
    expect(plugin.settings.soundFadeMs).toBe(0);
    expect(await plugin.loadData()).toMatchObject({ fadeMs: 2500, soundFadeMs: 0 });
  });

  it("the drag setting offers select or pan, saves, and tells open boards", async () => {
    const { plugin, sync } = await show();
    const dropdown = Setting.named("Drag on empty space").controls[0];
    expect(Object.keys(dropdown.options)).toEqual(["select", "pan"]);

    await dropdown.handler("pan");
    expect(plugin.settings.panByDefault).toBe(true);
    expect(sync).toHaveBeenCalled();

    await dropdown.handler("select");
    expect(plugin.settings.panByDefault).toBe(false);
  });
});
