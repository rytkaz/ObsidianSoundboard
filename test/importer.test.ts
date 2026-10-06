import { describe, expect, it, vi } from "vitest";
import { CARD_H, CARD_W } from "../src/types";
import { makeSound } from "./helpers/builders";
import { appWithFiles, flush, openBoard } from "./helpers/fixture";
import { FuzzySuggestModal, Notice, TFile, TFolder } from "./mocks/obsidian";

const open = (board: Parameters<typeof openBoard>[0] = {}, ...files: string[]) =>
  openBoard(board, { app: appWithFiles(...files) });

const fileOf = (app: ReturnType<typeof appWithFiles>, path: string) => app.vault.getAbstractFileByPath(path) as TFile;

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < CARD_H;

describe("addFiles", () => {
  it("adds a card per file, sorted naturally, and selects them", async () => {
    const { view, app } = await open({}, "rain 10.mp3", "rain 2.mp3", "rain 1.mp3");
    const files = ["rain 10.mp3", "rain 2.mp3", "rain 1.mp3"].map((p) => fileOf(app, p));
    view.importer.addFiles(files as never, { x: 0, y: 0 });
    expect(view.board.sounds.map((s) => s.path)).toEqual(["rain 1.mp3", "rain 2.mp3", "rain 10.mp3"]);
    expect(view.selection.size).toBe(3);
  });

  it("gives audio cards 0.8 volume and looping on", async () => {
    const { view, app } = await open({}, "rain.mp3");
    view.importer.addFiles([fileOf(app, "rain.mp3")] as never, { x: 5, y: 6 });
    expect(view.board.sounds[0]).toMatchObject({ kind: "audio", volume: 0.8, loop: true, x: 5, y: 6 });
  });

  it("turns soundboard files into nested-board cards at full volume", async () => {
    const { view, app } = await open({}, "Child.soundboard");
    view.importer.addFiles([fileOf(app, "Child.soundboard")] as never, { x: 0, y: 0 });
    expect(view.board.sounds[0]).toMatchObject({ kind: "board", volume: 1 });
  });

  it("never lands on top of existing cards", async () => {
    const { view, app } = await open({ sounds: [makeSound({ x: 0, y: 0 })] }, "a.mp3", "b.mp3", "c.mp3");
    view.importer.addFiles(["a.mp3", "b.mp3", "c.mp3"].map((p) => fileOf(app, p)) as never, { x: 0, y: 0 });
    const [existing, ...added] = view.board.sounds;
    for (const card of added) expect(overlaps(card, existing)).toBe(false);
    added.forEach((c, i) => added.slice(i + 1).forEach((d) => expect(overlaps(c, d)).toBe(false)));
  });

  it("centres a lone card in the visible area when no position is given", async () => {
    const { view, app } = await open({}, "rain.mp3");
    view.importer.addFiles([fileOf(app, "rain.mp3")] as never);
    expect(view.board.sounds[0]).toMatchObject({ x: -CARD_W / 2, y: -CARD_H / 2 });
  });

  it("does nothing for an empty list", async () => {
    const { view } = await open();
    view.importer.addFiles([]);
    expect(view.board.sounds).toEqual([]);
  });

  it("renders the new cards and can be undone", async () => {
    const { view, app } = await open({}, "rain.mp3");
    view.importer.addFiles([fileOf(app, "rain.mp3")] as never, { x: 0, y: 0 });
    expect(view.contentEl.querySelectorAll(".sb-card")).toHaveLength(1);
    view.actions.undo();
    expect(view.board.sounds).toEqual([]);
  });
});

describe("addFolder", () => {
  it("adds every audio file inside, including subfolders, and ignores other files", async () => {
    const { view, app } = await open({}, "Rain/heavy.mp3", "Rain/light.mp3", "Rain/Storm/thunder.ogg", "Rain/notes.md");
    view.importer.addFolder(app.vault.getAbstractFileByPath("Rain") as never, { x: 0, y: 0 });
    expect(view.board.sounds.map((s) => s.path).sort()).toEqual([
      "Rain/Storm/thunder.ogg",
      "Rain/heavy.mp3",
      "Rain/light.mp3",
    ]);
    expect(Notice.messages.at(-1)).toBe("Added 3 sounds from Rain");
  });

  it("tells you when the folder has no audio", async () => {
    const { view, app } = await open({}, "Docs/readme.md");
    view.importer.addFolder(app.vault.getAbstractFileByPath("Docs") as never);
    expect(view.board.sounds).toEqual([]);
    expect(Notice.messages.at(-1)).toMatch(/has no audio/);
  });
});

describe("pickers", () => {
  it("the folder picker lists folders that contain audio, nested ones included, sorted", async () => {
    const { view } = await open({}, "Rain/heavy.mp3", "Rain/Storm/thunder.ogg", "Docs/readme.md", "loose.mp3");
    view.importer.pickFolderFromVault();
    const picker = FuzzySuggestModal.opened[0];
    expect(picker.getItems().map((f: TFolder) => f.path)).toEqual(["Rain", "Rain/Storm"]);
  });

  it("choosing a folder adds its audio at the given position", async () => {
    const { view } = await open({}, "Rain/heavy.mp3");
    view.importer.pickFolderFromVault({ x: 40, y: 50 });
    const picker = FuzzySuggestModal.opened[0];
    picker.onChooseItem(picker.getItems()[0]);
    expect(view.board.sounds[0]).toMatchObject({ path: "Rain/heavy.mp3", x: 40, y: 50 });
  });

  it("says so when the vault has no folders with audio", async () => {
    const { view } = await open({}, "loose.mp3", "Docs/readme.md");
    view.importer.pickFolderFromVault();
    expect(FuzzySuggestModal.opened).toHaveLength(0);
    expect(Notice.messages.at(-1)).toMatch(/no folders with audio/i);
  });

  it("the audio picker only lists audio files", async () => {
    const { view } = await open({}, "a.mp3", "b.txt", "c.soundboard");
    view.importer.pickAudioFromVault();
    expect(FuzzySuggestModal.opened[0].getItems().map((f: TFile) => f.path)).toEqual(["a.mp3"]);
  });

  it("the soundboard picker lists other boards but not this one", async () => {
    const { view } = await open({}, "Other.soundboard", "a.mp3");
    view.importer.pickBoardFromVault();
    expect(FuzzySuggestModal.opened[0].getItems().map((f: TFile) => f.path)).toEqual(["Other.soundboard"]);
  });
});

describe("importExternal", () => {
  const item = (relPath: string) => ({ file: new File(["x"], relPath.split("/").pop()!), relPath });

  it("copies files into the Soundboard folder and adds cards", async () => {
    const { view, vault } = await open();
    await view.importer.importExternal([item("rain.mp3")], { x: 0, y: 0 });
    expect(vault.getAbstractFileByPath("Soundboard/rain.mp3")).toBeInstanceOf(TFile);
    expect(view.board.sounds.map((s) => s.path)).toEqual(["Soundboard/rain.mp3"]);
    expect(Notice.messages.at(-1)).toBe("Imported 1 sound into Soundboard/");
  });

  it("keeps the folder structure, creating missing folders", async () => {
    const { view, vault } = await open();
    await view.importer.importExternal([item("Rain/heavy.mp3"), item("Rain/Storm/thunder.ogg")], { x: 0, y: 0 });
    expect(vault.getAbstractFileByPath("Soundboard/Rain")).toBeInstanceOf(TFolder);
    expect(vault.getAbstractFileByPath("Soundboard/Rain/Storm/thunder.ogg")).toBeInstanceOf(TFile);
    expect(view.board.sounds).toHaveLength(2);
  });

  it("never overwrites: name clashes get a number", async () => {
    const { view, vault } = await open({}, "Soundboard/rain.mp3");
    await view.importer.importExternal([item("rain.mp3")], { x: 0, y: 0 });
    await view.importer.importExternal([item("rain.mp3")], { x: 500, y: 0 });
    expect(vault.getAbstractFileByPath("Soundboard/rain 1.mp3")).toBeInstanceOf(TFile);
    expect(vault.getAbstractFileByPath("Soundboard/rain 2.mp3")).toBeInstanceOf(TFile);
  });

  it("does nothing for an empty list", async () => {
    const { view } = await open();
    await view.importer.importExternal([]);
    expect(Notice.messages).toEqual([]);
  });
});

describe("system file pickers", () => {
  function captureInput() {
    const box: { input?: HTMLInputElement } = {};
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      box.input = this;
    });
    return box;
  }
  const choose = (input: HTMLInputElement, files: File[]) => {
    Object.defineProperty(input, "files", { value: files });
    input.onchange!(new Event("change"));
  };

  it("import audio from computer accepts several audio files and ignores the rest", async () => {
    const { view } = await open();
    const box = captureInput();
    view.importer.pickFromComputer({ x: 0, y: 0 });
    expect(box.input!.multiple).toBe(true);
    expect(box.input!.accept).toBe("audio/*");

    choose(box.input!, [new File(["x"], "a.mp3"), new File(["x"], "b.txt")]);
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
    expect(view.board.sounds[0].path).toBe("Soundboard/a.mp3");
  });

  it("import folder from computer keeps the folder structure", async () => {
    const { view } = await open();
    const box = captureInput();
    view.importer.pickFolderFromComputer({ x: 0, y: 0 });
    expect(box.input!.webkitdirectory).toBe(true);

    const file = new File(["x"], "heavy.mp3");
    Object.defineProperty(file, "webkitRelativePath", { value: "Rain/heavy.mp3" });
    choose(box.input!, [file]);
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
    expect(view.board.sounds[0].path).toBe("Soundboard/Rain/heavy.mp3");
  });

  it("import folder from computer tells you when there is no audio", async () => {
    const { view } = await open();
    const box = captureInput();
    view.importer.pickFolderFromComputer();
    choose(box.input!, [new File(["x"], "notes.txt")]);
    expect(Notice.messages.at(-1)).toMatch(/no audio files/i);
  });
});

describe("addScene", () => {
  it("adds numbered scenes with a distinct colour and full volume", async () => {
    const { view } = await open();
    view.importer.addScene({ x: 10, y: 20 });
    view.importer.addScene({ x: 900, y: 20 });
    const [one, two] = view.board.scenes;
    expect([one.name, two.name]).toEqual(["Scene 1", "Scene 2"]);
    expect(one.hue).not.toBe(two.hue);
    expect(one).toMatchObject({ x: 10, y: 20, volume: 1 });
  });

  it("centres a scene in the visible area by default", async () => {
    const { view } = await open();
    view.importer.addScene();
    const sc = view.board.scenes[0];
    expect(sc.x + sc.w / 2).toBeCloseTo(0, 0);
    expect(sc.y + sc.h / 2).toBeCloseTo(0, 0);
  });
});

describe("dropping onto the board", () => {
  function drop(view: Awaited<ReturnType<typeof open>>["view"], dataTransfer: unknown, x = 100, y = 50) {
    const e = new Event("drop", { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    e.dataTransfer = dataTransfer;
    e.clientX = x;
    e.clientY = y;
    view.viewportEl.dispatchEvent(e);
  }

  it("imports audio files dropped from the computer where they were dropped", async () => {
    const { view } = await open();
    drop(view, { items: [], files: [new File(["x"], "a.mp3"), new File(["x"], "b.txt")] }, 120, 80);
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
    expect(view.board.sounds[0]).toMatchObject({ path: "Soundboard/a.mp3", x: 120, y: 80 });
  });

  it("imports a dropped folder", async () => {
    const { view } = await open();
    const entry = {
      isFile: false,
      isDirectory: true,
      name: "Rain",
      fullPath: "/Rain",
      createReader() {
        let done = false;
        return {
          readEntries(ok: (e: unknown[]) => void) {
            ok(
              done
                ? []
                : [
                    {
                      isFile: true,
                      isDirectory: false,
                      name: "heavy.mp3",
                      fullPath: "/Rain/heavy.mp3",
                      file: (cb: (f: File) => void) => cb(new File(["x"], "heavy.mp3")),
                    },
                  ]
            );
            done = true;
          },
        };
      },
    };
    drop(view, { items: [{ kind: "file", webkitGetAsEntry: () => entry }], files: [] });
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
    expect(view.board.sounds[0].path).toBe("Soundboard/Rain/heavy.mp3");
  });

  it("accepts an audio file dragged out of Obsidian's file explorer", async () => {
    const { view, app } = await open({}, "rain.mp3");
    (app as unknown as Record<string, unknown>).dragManager = {
      draggable: { type: "file", file: fileOf(app, "rain.mp3") },
    };
    drop(view, { items: [], files: [] });
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
    expect(view.board.sounds[0].path).toBe("rain.mp3");
  });

  it("accepts a folder dragged out of Obsidian's file explorer", async () => {
    const { view, app } = await open({}, "Rain/heavy.mp3");
    (app as unknown as Record<string, unknown>).dragManager = {
      draggable: { type: "folder", file: app.vault.getAbstractFileByPath("Rain") },
    };
    drop(view, { items: [], files: [] });
    await vi.waitFor(() => expect(view.board.sounds).toHaveLength(1));
  });

  it("does not nest a board inside itself when it is dragged onto its own view", async () => {
    const { view, app, file } = await open();
    (app as unknown as Record<string, unknown>).dragManager = { draggable: { type: "file", file } };
    drop(view, { items: [], files: [] });
    await flush();
    expect(view.board.sounds).toEqual([]);
  });

  it("ignores drops with nothing usable", async () => {
    const { view } = await open();
    drop(view, { items: [], files: [new File(["x"], "notes.txt")] });
    await flush();
    expect(view.board.sounds).toEqual([]);
  });
});
