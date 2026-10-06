import { describe, expect, it } from "vitest";
import { makeSound } from "./helpers/builders";
import { FakeAudio } from "./helpers/fake-audio";
import { appWithFiles, cardEl, flush, openBoard } from "./helpers/fixture";
import { Menu } from "./mocks/obsidian";

const open = (board = {}) => openBoard(board, { app: appWithFiles("rain.mp3") });
const button = (view: Awaited<ReturnType<typeof open>>["view"], label: string) =>
  [...view.contentEl.querySelectorAll<HTMLButtonElement>(".sb-tool")].find((b) => b.textContent?.includes(label))!;

describe("toolbar", () => {
  it("has the expected buttons", async () => {
    const { view } = await open();
    const labels = [...view.contentEl.querySelectorAll(".sb-tool")].map((b) => b.textContent);
    expect(labels).toEqual(["Add sound", "Add scene", "Stop all", "One scene at a time", "100%"]);
  });

  it("Add sound opens a menu of ways to add audio (without the scene entry)", async () => {
    const { view } = await open();
    button(view, "Add sound").click();
    expect(Menu.last!.titles).toEqual([
      "Import audio from computer",
      "Import folder from computer",
      "Add audio from vault",
      "Add folder from vault",
      "Add soundboard from vault",
    ]);
  });

  it("Add scene adds a scene in the middle of the view", async () => {
    const { view } = await open();
    button(view, "Add scene").click();
    expect(view.board.scenes).toHaveLength(1);
  });

  it("Stop all stops every sound", async () => {
    const { view } = await open({ sounds: [makeSound({ path: "rain.mp3" })] });
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    button(view, "Stop all").click();
    expect(FakeAudio.instances[0].paused).toBe(true);
  });

  it("the one-scene toggle flips and saves the setting, and lights up", async () => {
    const { view, plugin } = await open();
    const toggle = button(view, "One scene at a time");
    expect(toggle.classList.contains("is-on")).toBe(false);

    toggle.click();
    await flush();
    expect(plugin.settings.exclusive).toBe(true);
    expect(toggle.classList.contains("is-on")).toBe(true);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(await plugin.loadData()).toMatchObject({ exclusive: true });

    toggle.click();
    await flush();
    expect(toggle.classList.contains("is-on")).toBe(false);
  });

  it("the toggle is in sync across boards", async () => {
    const app = appWithFiles("rain.mp3");
    const first = await openBoard({}, { app, path: "A.soundboard" });
    const second = await openBoard({}, { app, plugin: first.plugin, path: "B.soundboard" });
    button(first.view, "One scene at a time").click();
    await flush();
    expect(button(second.view, "One scene at a time").classList.contains("is-on")).toBe(true);
  });

  it("the zoom button shows the zoom level", async () => {
    const { view } = await open();
    view.board.view.zoom = 1.5;
    view.camera.apply();
    expect(button(view, "150%")).toBeDefined();
  });
});
