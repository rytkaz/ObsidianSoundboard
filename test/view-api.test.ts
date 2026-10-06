import { describe, expect, it } from "vitest";
import { VIEW_TYPE } from "../src/types";
import { makeSound } from "./helpers/builders";
import { appWithFiles, cardEls, openBoard } from "./helpers/fixture";

describe("view basics", () => {
  it("identifies itself to Obsidian", async () => {
    const { view } = await openBoard({}, { path: "Night.soundboard" });
    expect(view.getViewType()).toBe(VIEW_TYPE);
    expect(view.getDisplayText()).toBe("Night");
    expect(view.getIcon()).toBe("audio-lines");
  });

  it("falls back to a generic title when no file is attached", async () => {
    const { view } = await openBoard();
    view.file = null;
    expect(view.getDisplayText()).toBe("Soundboard");
  });

  it("clear() empties the board and the screen", async () => {
    const { view } = await openBoard({ sounds: [makeSound({ path: "rain.mp3" })] }, { app: appWithFiles("rain.mp3") });
    expect(cardEls(view)).toHaveLength(1);
    view.clear();
    expect(view.board.sounds).toEqual([]);
    expect(cardEls(view)).toHaveLength(0);
  });

  it("clear() also forgets the undo history", async () => {
    const { view } = await openBoard({ sounds: [makeSound({ path: "rain.mp3" })] }, { app: appWithFiles("rain.mp3") });
    view.clear();
    view.undo();
    expect(view.board.sounds).toEqual([]);
  });

  it("render() before the view is opened does nothing", async () => {
    const { plugin, app } = await openBoard();
    const { SoundboardView } = await import("../src/ui/soundboard-view");
    const { WorkspaceLeaf } = await import("./mocks/obsidian");
    const fresh = new SoundboardView(new WorkspaceLeaf(app) as never, plugin);
    expect(() => fresh.render()).not.toThrow();
  });
});
