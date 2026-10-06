import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSound } from "./helpers/builders";
import { FakeAudio } from "./helpers/fake-audio";
import { appWithFiles, cardEl, ctrl, dragBy, flush, openBoard, rightClick } from "./helpers/fixture";
import { Menu, Modal, Notice, TFile } from "./mocks/obsidian";

const TIMERS = { toFake: ["setTimeout", "clearTimeout"] as ("setTimeout" | "clearTimeout")[] };

afterEach(() => {
  vi.useRealTimers();
});

/** Waits long enough for the view (200 ms) and plugin (300 ms) to finish reacting to renames. */
const settle = async () => {
  await flush();
  vi.advanceTimersByTime(500);
  await flush();
};

async function submitRename(to: string) {
  const input = Modal.last!.contentEl.querySelector<HTMLInputElement>("input")!;
  input.value = to;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await flush();
}

describe("renaming a file from its card", () => {
  const open = (path = "rain.mp3", kind: "audio" | "board" = "audio") =>
    openBoard(
      { sounds: [makeSound({ id: "a", path, kind })] },
      { app: appWithFiles(path, "wind.mp3", "Taken.soundboard") }
    );

  const startRename = (view: Awaited<ReturnType<typeof open>>["view"], title = "Rename audio file…") => {
    rightClick(cardEl(view));
    Menu.last!.click(title);
  };

  it("pre-fills the name without folder or extension", async () => {
    const { view } = await open("Sounds/rain.mp3");
    startRename(view);
    expect(Modal.last!.contentEl.querySelector("input")!.value).toBe("rain");
  });

  it("renames the file, keeping its folder and extension, and the card follows", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open("Sounds/rain.mp3");
    startRename(view);
    await submitRename("storm");
    await settle();

    expect(vault.getAbstractFileByPath("Sounds/storm.mp3")).toBeInstanceOf(TFile);
    expect(vault.getAbstractFileByPath("Sounds/rain.mp3")).toBeNull();
    expect(view.board.sounds[0].path).toBe("Sounds/storm.mp3");
    expect(cardEl(view).querySelector(".sb-card-name")?.textContent).toBe("storm");
    expect(cardEl(view).classList.contains("is-missing")).toBe(false);
  });

  it("closes the dialog after a successful rename", async () => {
    vi.useFakeTimers(TIMERS);
    const { view } = await open();
    startRename(view);
    const dialog = Modal.last!.contentEl;
    await submitRename("storm");
    expect(dialog.childElementCount).toBe(0);
  });

  it("renames a nested soundboard file too", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open("Child.soundboard", "board");
    startRename(view, "Rename soundboard…");
    await submitRename("Renamed");
    await settle();
    expect(vault.getAbstractFileByPath("Renamed.soundboard")).toBeInstanceOf(TFile);
    expect(view.board.sounds[0].path).toBe("Renamed.soundboard");
  });

  it("does nothing when the name is unchanged", async () => {
    const { view, vault } = await open();
    startRename(view);
    const spy = vi.spyOn(vault, "rename");
    await submitRename("rain");
    expect(spy).not.toHaveBeenCalled();
    expect(Modal.last!.contentEl.childElementCount).toBe(0);
  });

  it.each([
    ["", /enter a name/i],
    ["a/b", /cannot contain/i],
    [".hidden", /dot/i],
    ["wind", /already exists/i],
  ])("rejects %j and keeps the dialog open with a message", async (name, message) => {
    const { view, vault } = await open();
    startRename(view);
    const spy = vi.spyOn(vault, "rename");
    await submitRename(name);
    expect(spy).not.toHaveBeenCalled();
    expect(Modal.last!.contentEl.querySelector(".sb-modal-error")?.textContent).toMatch(message);
  });

  it("the Rename button does the same as Enter", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    startRename(view);
    const dialog = Modal.last!.contentEl;
    dialog.querySelector<HTMLInputElement>("input")!.value = "storm";
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Rename")!.click();
    await settle();
    expect(vault.getAbstractFileByPath("storm.mp3")).toBeInstanceOf(TFile);
  });

  it("the Cancel button closes without renaming", async () => {
    const { view, vault } = await open();
    startRename(view);
    const dialog = Modal.last!.contentEl;
    const spy = vi.spyOn(vault, "rename");
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click();
    expect(spy).not.toHaveBeenCalled();
    expect(dialog.childElementCount).toBe(0);
  });

  it("warns when the card's file no longer exists", async () => {
    const { view } = await openBoard({ sounds: [makeSound({ path: "ghost.mp3" })] });
    rightClick(cardEl(view));
    Menu.last!.click("Rename audio file…");
    expect(Notice.messages.at(-1)).toMatch(/ghost\.mp3.*not found/);
    expect(Modal.last).toBeNull();
  });

  it("undo after a rename restores the layout but keeps the new path", async () => {
    vi.useFakeTimers(TIMERS);
    const { view } = await open();
    dragBy(cardEl(view), 50, 30);
    startRename(view);
    await submitRename("storm");
    await settle();

    ctrl(view, "z");
    expect(view.board.sounds[0]).toMatchObject({ x: 0, y: 0, path: "storm.mp3" });
    ctrl(view, "z", { shiftKey: true });
    expect(view.board.sounds[0]).toMatchObject({ x: 50, y: 30, path: "storm.mp3" });
  });

  it("a card that is playing keeps playing from the same place after a rename", async () => {
    vi.useFakeTimers(TIMERS);
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    const audio = FakeAudio.instances[0];
    audio.currentTime = 33;

    startRename(view);
    await submitRename("storm");
    await settle();

    expect(audio.src).toBe("app://local/storm.mp3");
    expect(audio.currentTime).toBe(33);
    expect(audio.paused).toBe(false);
  });
});

describe.each(["staged", "settled"] as const)("renaming the parent folder (%s events)", (order) => {
  const open = () =>
    openBoard(
      {
        sounds: [
          makeSound({ id: "a", path: "Sounds/rain.mp3", x: 0 }),
          makeSound({ id: "b", path: "Sounds/Storm/thunder.mp3", x: 400 }),
          makeSound({ id: "c", path: "Elsewhere/wind.mp3", x: 800 }),
        ],
      },
      { app: appWithFiles("Sounds/rain.mp3", "Sounds/Storm/thunder.mp3", "Elsewhere/wind.mp3") }
    );

  it("updates every card inside the folder and leaves the others alone", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio", order);
    await settle();
    expect(view.board.sounds.map((s) => s.path)).toEqual([
      "Audio/rain.mp3",
      "Audio/Storm/thunder.mp3",
      "Elsewhere/wind.mp3",
    ]);
  });

  it("no card is shown as missing once the rename has settled", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio", order);
    await settle();
    expect(view.contentEl.querySelectorAll(".sb-card.is-missing")).toHaveLength(0);
  });

  it("labels and the saved file reflect the new paths", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio", order);
    await settle();
    expect(JSON.parse(view.getViewData()).sounds[0].path).toBe("Audio/rain.mp3");
    expect(view.saveRequests).toBeGreaterThan(0);
  });

  it("playing sounds are re-pointed and keep playing", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    cardEl(view, 0).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    const audio = FakeAudio.instances[0];

    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio", order);
    await settle();
    expect(audio.src).toBe("app://local/Audio/rain.mp3");
    expect(audio.paused).toBe(false);
  });

  it("undo history points at the new paths", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await open();
    dragBy(cardEl(view, 0), 10, 10);
    await vault.rename(vault.getAbstractFileByPath("Sounds")!, "Audio", order);
    await settle();
    ctrl(view, "z");
    expect(view.board.sounds[0]).toMatchObject({ x: 0, path: "Audio/rain.mp3" });
  });
});

describe("renaming a folder in several steps", () => {
  it("handles one folder renamed twice in a row", async () => {
    vi.useFakeTimers(TIMERS);
    const { view, vault } = await openBoard(
      { sounds: [makeSound({ path: "One/rain.mp3" })] },
      { app: appWithFiles("One/rain.mp3") }
    );
    await vault.rename(vault.getAbstractFileByPath("One")!, "Two");
    await vault.rename(vault.getAbstractFileByPath("Two")!, "Three");
    await settle();
    expect(view.board.sounds[0].path).toBe("Three/rain.mp3");
    expect(view.contentEl.querySelectorAll(".sb-card.is-missing")).toHaveLength(0);
  });
});
