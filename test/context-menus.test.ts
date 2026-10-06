import { describe, expect, it } from "vitest";
import { Menu, Modal, FuzzySuggestModal } from "./mocks/obsidian";
import { makeScene, makeSound } from "./helpers/builders";
import { FakeAudio } from "./helpers/fake-audio";
import { appWithFiles, cardEl, flush, openBoard, rightClick } from "./helpers/fixture";

const open = (board: Parameters<typeof openBoard>[0] = {}, ...files: string[]) =>
  openBoard(board, { app: appWithFiles("rain.mp3", "wind.mp3", ...files) });

const twoCards = () => ({
  sounds: [
    makeSound({ id: "a", path: "rain.mp3", x: 0, y: 0 }),
    makeSound({ id: "b", path: "wind.mp3", x: 400, y: 0 }),
  ],
});

const menu = () => Menu.last!;

// This file runs in its own module graph, so nothing has been copied yet in the first test.
describe("menu on empty space", () => {
  it("offers every way to add things, plus paste and select all", async () => {
    const { view } = await open();
    rightClick(view.viewportEl);
    expect(menu().titles).toEqual([
      "Import audio from computer",
      "Import folder from computer",
      "Add audio from vault",
      "Add folder from vault",
      "Add soundboard from vault",
      "Add scene",
      "Paste",
      "Select all",
    ]);
  });

  it("disables Paste until something has been copied, and Select all on an empty board", async () => {
    const { view } = await open();
    rightClick(view.viewportEl);
    expect(menu().item("Paste").disabled).toBe(true);
    expect(menu().item("Select all").disabled).toBe(true);
  });

  it("enables Select all when there is something to select", async () => {
    const { view } = await open(twoCards());
    rightClick(view.viewportEl);
    expect(menu().item("Select all").disabled).toBe(false);
    menu().click("Select all");
    expect(view.selection.size).toBe(2);
  });

  it("Add scene puts a scene where you clicked", async () => {
    const { view } = await open();
    rightClick(view.viewportEl);
    menu().click("Add scene");
    expect(view.board.scenes).toHaveLength(1);
    expect(view.board.scenes[0]).toMatchObject({ x: 300, y: 200 });
  });

  it("Add audio from vault lists audio files and drops the pick where you clicked", async () => {
    const { view } = await open({}, "notes.md");
    rightClick(view.viewportEl);
    menu().click("Add audio from vault");
    const picker = FuzzySuggestModal.opened[0];
    expect(
      picker
        .getItems()
        .map((f: { path: string }) => f.path)
        .sort()
    ).toEqual(["rain.mp3", "wind.mp3"]);

    picker.onChooseItem(picker.getItems()[0]);
    expect(view.board.sounds).toHaveLength(1);
    expect(view.board.sounds[0]).toMatchObject({ x: 300, y: 200 });
  });

  it("Add soundboard from vault leaves out the board you are on", async () => {
    const { view } = await open({}, "Other.soundboard");
    rightClick(view.viewportEl);
    menu().click("Add soundboard from vault");
    const picker = FuzzySuggestModal.opened[0];
    expect(picker.getItems().map((f: { path: string }) => f.path)).toEqual(["Other.soundboard"]);
  });

  it("Add folder from vault opens the folder picker", async () => {
    const { view } = await open({}, "Rain/heavy.mp3");
    rightClick(view.viewportEl);
    menu().click("Add folder from vault");
    expect(FuzzySuggestModal.opened).toHaveLength(1);
    expect(FuzzySuggestModal.opened[0].placeholder).toMatch(/folders/i);
  });

  it("does not offer the board menu on the toolbar", async () => {
    const { view } = await open();
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-toolbar")!);
    expect(Menu.last).toBeNull();
  });
});

describe("menu on a sound card", () => {
  it("offers play, rename, copy and delete", async () => {
    const { view } = await open(twoCards());
    rightClick(cardEl(view));
    expect(menu().titles).toEqual(["Play", "Rename audio file…", "Copy", "Delete"]);
    expect(menu().item("Delete").warning).toBe(true);
  });

  it("selects the card you right-clicked", async () => {
    const { view } = await open(twoCards());
    view.selection.set(["b"]);
    rightClick(cardEl(view, 0));
    expect([...view.selection.snapshot()]).toEqual(["a"]);
  });

  it("keeps a multi-selection when you right-click inside it, and says how many", async () => {
    const { view } = await open(twoCards());
    view.selection.set(["a", "b"]);
    rightClick(cardEl(view, 0));
    expect([...view.selection.snapshot()].sort()).toEqual(["a", "b"]);
    expect(menu().titles).toContain("Copy 2 items");
    expect(menu().titles).toContain("Delete 2 items");
  });

  it("Delete removes the whole selection", async () => {
    const { view } = await open(twoCards());
    view.selection.set(["a", "b"]);
    rightClick(cardEl(view, 0));
    menu().click("Delete 2 items");
    expect(view.board.sounds).toEqual([]);
  });

  it("Delete on a single card removes just that card", async () => {
    const { view } = await open(twoCards());
    rightClick(cardEl(view, 1));
    menu().click("Delete");
    expect(view.board.sounds.map((s) => s.id)).toEqual(["a"]);
  });

  it("Copy then Paste (from the empty-space menu) duplicates at the click position", async () => {
    const { view } = await open(twoCards());
    rightClick(cardEl(view, 0));
    menu().click("Copy");

    rightClick(view.viewportEl);
    expect(menu().item("Paste").disabled).toBe(false);
    menu().click("Paste");
    expect(view.board.sounds).toHaveLength(3);
    expect(view.board.sounds[2]).toMatchObject({ path: "rain.mp3", x: 300, y: 200 });
  });

  it("Play starts the card, and the item then reads Pause", async () => {
    const { view } = await open(twoCards());
    rightClick(cardEl(view));
    menu().click("Play");
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(false);

    rightClick(cardEl(view));
    expect(menu().titles[0]).toBe("Pause");
    menu().click("Pause");
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(true);
  });

  it("Rename opens the rename dialog", async () => {
    const { view } = await open(twoCards());
    rightClick(cardEl(view));
    menu().click("Rename audio file…");
    expect(Modal.last).not.toBeNull();
    expect(Modal.last!.contentEl.querySelector("h3")?.textContent).toBe("Rename audio file");
  });
});

describe("menu on a nested soundboard card", () => {
  const withBoard = () =>
    open({ sounds: [makeSound({ id: "n", kind: "board", path: "Child.soundboard" })] }, "Child.soundboard");

  it("offers opening and renaming the soundboard", async () => {
    const { view } = await withBoard();
    rightClick(cardEl(view));
    expect(menu().titles).toEqual(["Play", "Open soundboard", "Rename soundboard…", "Copy", "Delete"]);
  });

  it("Open soundboard opens the file in a new tab", async () => {
    const { view, app } = await withBoard();
    rightClick(cardEl(view));
    menu().click("Open soundboard");
    const opened = app.workspace.leaves.flatMap((l) => l.opened).map((f) => f.path);
    expect(opened).toEqual(["Child.soundboard"]);
  });

  it("Rename opens a soundboard-specific dialog", async () => {
    const { view } = await withBoard();
    rightClick(cardEl(view));
    menu().click("Rename soundboard…");
    expect(Modal.last!.contentEl.querySelector("h3")?.textContent).toBe("Rename soundboard");
  });
});

describe("menu on a scene", () => {
  it("offers play/pause, rename, copy and delete", async () => {
    const { view } = await open({ scenes: [makeScene({})] } as never);
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-scene-head")!);
    expect(menu().titles).toEqual(["Play / pause scene", "Rename scene…", "Copy", "Delete"]);
  });

  it("Play / pause scene toggles the cards inside", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 10, y: 10 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-scene-head")!);
    menu().click("Play / pause scene");
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(false);
  });

  it("Rename scene starts inline editing", async () => {
    const { view } = await open({ scenes: [makeScene({ name: "Night" })] } as never);
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-scene-head")!);
    menu().click("Rename scene…");
    expect(view.contentEl.querySelector<HTMLInputElement>(".sb-rename")?.value).toBe("Night");
  });

  it("Delete removes the scene frame but keeps its cards", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 10, y: 10 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-scene-head")!);
    menu().click("Delete");
    expect(view.board.scenes).toEqual([]);
    expect(view.board.sounds).toHaveLength(1);
  });

  it("right-clicking the inside of a scene gives the empty-space menu", async () => {
    const { view } = await open({ scenes: [makeScene({})] } as never);
    rightClick(view.contentEl.querySelector<HTMLElement>(".sb-scene")!);
    expect(menu().titles).toContain("Add scene");
  });
});
