import { afterEach, describe, expect, it, vi } from "vitest";
import SoundboardPlugin from "../src/main";
import { VIEW_TYPE } from "../src/types";
import { makeSound } from "./helpers/builders";
import { appWithFiles, cardEl, createPlugin, dragBy, flush, openBoard, type TestPlugin } from "./helpers/fixture";
import { App, TFile, WorkspaceLeaf } from "./mocks/obsidian";

const TIMERS = { toFake: ["setTimeout", "clearTimeout"] as ("setTimeout" | "clearTimeout")[] };

afterEach(() => {
  vi.useRealTimers();
});

const boardJson = (...paths: string[]) =>
  JSON.stringify({
    view: { x: 0, y: 0, zoom: 1 },
    sounds: paths.map((path, i) => ({ id: `s${i}`, kind: "audio", path, x: i * 300, y: 0, volume: 1, loop: true })),
    scenes: [],
  });

const sounds = (app: App, path: string) =>
  JSON.parse(app.vault.textOf(path)).sounds.map((s: { path: string }) => s.path);

describe("onload", () => {
  it("registers the view, the file type, the ribbon icon and the commands", async () => {
    const plugin = await createPlugin();
    expect(plugin.views.has(VIEW_TYPE)).toBe(true);
    expect(plugin.extensions).toEqual(["soundboard"]);
    expect(plugin.ribbonIcons.map((r) => r.title)).toEqual(["New soundboard"]);
    expect([...plugin.commands.keys()].sort()).toEqual(["new-soundboard", "redo", "stop-all", "undo"]);
    expect(plugin.settingTabs).toHaveLength(1);
  });

  it("creates a working view from the registered factory", async () => {
    const app = new App();
    const plugin = await createPlugin(app);
    const view = plugin.views.get(VIEW_TYPE)!(new WorkspaceLeaf(app)) as { getViewType(): string };
    expect(view.getViewType()).toBe(VIEW_TYPE);
  });

  it("starts from default settings", async () => {
    const plugin = new SoundboardPlugin(new App() as never, {} as never);
    await plugin.onload();
    expect(plugin.settings).toEqual({ exclusive: false, fadeMs: 1500, soundFadeMs: 800, panByDefault: false });
  });

  it("merges saved settings over the defaults, so new settings appear for old installs", async () => {
    const plugin = new SoundboardPlugin(new App() as never, {} as never);
    await plugin.saveData({ fadeMs: 3000, exclusive: true });
    await plugin.onload();
    expect(plugin.settings).toMatchObject({ fadeMs: 3000, exclusive: true, soundFadeMs: 800, panByDefault: false });
  });

  it("saveSettings persists", async () => {
    const plugin = await createPlugin();
    plugin.settings.exclusive = true;
    await plugin.saveSettings();
    expect(await plugin.loadData()).toMatchObject({ exclusive: true });
  });
});

describe("creating a soundboard", () => {
  it("creates an empty board file and opens it", async () => {
    const app = new App();
    const plugin = await createPlugin(app);
    await plugin.createBoard();
    const file = app.vault.getAbstractFileByPath("Soundboard.soundboard") as TFile;
    expect(JSON.parse(app.vault.textOf(file.path))).toMatchObject({ sounds: [], scenes: [] });
    expect(app.workspace.leaves.flatMap((l) => l.opened)).toEqual([file]);
  });

  it("numbers new boards so none is overwritten", async () => {
    const app = new App();
    const plugin = await createPlugin(app);
    await plugin.createBoard();
    await plugin.createBoard();
    await plugin.createBoard();
    expect(app.vault.getFiles().map((f) => f.path)).toEqual([
      "Soundboard.soundboard",
      "Soundboard 1.soundboard",
      "Soundboard 2.soundboard",
    ]);
  });

  it("the ribbon icon and the command both create a board", async () => {
    const app = new App();
    const plugin = await createPlugin(app);
    plugin.ribbonIcons[0].cb();
    plugin.commands.get("new-soundboard")!.callback!();
    await flush();
    expect(app.vault.getFiles()).toHaveLength(2);
  });
});

describe("commands that act on the open soundboard", () => {
  const run = (plugin: TestPlugin, id: string, checking = false) => plugin.commands.get(id)!.checkCallback!(checking);

  it("are unavailable when no soundboard is active", async () => {
    const plugin = await createPlugin();
    for (const id of ["stop-all", "undo", "redo"]) expect(run(plugin, id, true)).toBe(false);
  });

  it("are available, and run, when a soundboard is active", async () => {
    const { plugin, view } = await openBoard(
      { sounds: [makeSound({ id: "a", path: "rain.mp3" })] },
      { app: appWithFiles("rain.mp3") }
    );
    const stop = vi.spyOn(view, "stopAll");
    expect(run(plugin, "stop-all", true)).toBe(true);
    expect(stop).not.toHaveBeenCalled(); // only checking
    run(plugin, "stop-all");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("undo and redo commands step through the board's history", async () => {
    const { plugin, view } = await openBoard(
      { sounds: [makeSound({ id: "a", path: "rain.mp3" })] },
      { app: appWithFiles("rain.mp3") }
    );
    dragBy(cardEl(view), 50, 30);
    run(plugin, "undo");
    expect(view.board.sounds[0].x).toBe(0);
    run(plugin, "redo");
    expect(view.board.sounds[0].x).toBe(50);
  });
});

describe("settings changes", () => {
  it("syncViews tells every open soundboard", async () => {
    const app = appWithFiles("rain.mp3");
    const plugin = await createPlugin(app);
    const a = await openBoard({}, { app, plugin, path: "A.soundboard" });
    const b = await openBoard({}, { app, plugin, path: "B.soundboard" });
    const spyA = vi.spyOn(a.view, "syncToolbar");
    const spyB = vi.spyOn(b.view, "syncToolbar");
    plugin.syncViews();
    expect(spyA).toHaveBeenCalledOnce();
    expect(spyB).toHaveBeenCalledOnce();
  });
});

describe("keeping boards valid after renames", () => {
  async function setup() {
    vi.useFakeTimers(TIMERS);
    const app = appWithFiles("Sounds/rain.mp3", "Sounds/wind.mp3", "Other/owl.mp3");
    app.vault.addFile("Closed.soundboard", boardJson("Sounds/rain.mp3", "Other/owl.mp3"));
    app.vault.addFile("Unrelated.soundboard", boardJson("Other/owl.mp3"));
    app.vault.addFile("Sounds/Inner.soundboard", boardJson("Sounds/wind.mp3"));
    const plugin = await createPlugin(app);
    const open = await openBoard(
      { sounds: [makeSound({ id: "a", path: "Sounds/rain.mp3" })] },
      { app, plugin, path: "Open.soundboard" }
    );
    app.vault.writeLog.length = 0;
    return { ...open };
  }

  const settle = async () => {
    await flush();
    vi.advanceTimersByTime(600);
    await flush();
  };

  it("updates an open board straight away", async () => {
    const { app, view, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    expect(view.board.sounds[0].path).toBe("Audio/rain.mp3");
    expect(app.vault.writeLog).not.toContain("Open.soundboard"); // the view saves itself
  });

  it("patches a closed board on disk once the burst of events is over", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    expect(sounds(app, "Closed.soundboard")).toEqual(["Sounds/rain.mp3", "Other/owl.mp3"]); // not yet
    await settle();
    expect(sounds(app, "Closed.soundboard")).toEqual(["Audio/rain.mp3", "Other/owl.mp3"]);
  });

  it("patches a closed board that lives inside the renamed folder", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    await settle();
    expect(sounds(app, "Audio/Inner.soundboard")).toEqual(["Audio/wind.mp3"]);
  });

  it("does not rewrite boards that are unaffected", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    await settle();
    expect(app.vault.writeLog).not.toContain("Unrelated.soundboard");
  });

  it("rewrites each affected board once, however many files the folder holds", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    await settle();
    expect(app.vault.writeLog.filter((p) => p === "Closed.soundboard")).toHaveLength(1);
  });

  it("handles a single file rename", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds/rain.mp3")!, "Sounds/storm.mp3");
    await settle();
    expect(sounds(app, "Closed.soundboard")).toEqual(["Sounds/storm.mp3", "Other/owl.mp3"]);
  });

  it("handles a rename followed by another before the first settles", async () => {
    const { app, vault } = await setup();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    await vault.rename(vault.getAbstractFileByPath("Audio")!, "Music");
    await settle();
    expect(sounds(app, "Closed.soundboard")).toEqual(["Music/rain.mp3", "Other/owl.mp3"]);
  });

  it("keeps going when one board cannot be read", async () => {
    const { app, vault } = await setup();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const read = app.vault.cachedRead.bind(app.vault);
    vi.spyOn(app.vault, "cachedRead").mockImplementation(async (file: TFile) => {
      if (file.path === "Closed.soundboard") throw new Error("disk on fire");
      return read(file);
    });

    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio");
    await settle();
    expect(errors).toHaveBeenCalled();
    expect(sounds(app, "Audio/Inner.soundboard")).toEqual(["Audio/wind.mp3"]);
  });

  it("ignores renames of files no board refers to", async () => {
    const { app, vault } = await setup();
    app.vault.addFile("notes.md", "hello");
    app.vault.writeLog.length = 0;
    await vault.rename(vault.getAbstractFileByPath("notes.md")!, "diary.md");
    await settle();
    expect(app.vault.writeLog).toEqual([]);
  });
});
