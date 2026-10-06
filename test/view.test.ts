import { afterEach, describe, expect, it, vi } from "vitest";
import { makeScene, makeSound } from "./helpers/builders";
import { FakeAudio } from "./helpers/fake-audio";
import {
  appWithFiles,
  boxSelect,
  cardEl,
  cardEls,
  ctrl,
  dragBy,
  flush,
  key,
  openBoard,
  pointer,
  sceneEls,
} from "./helpers/fixture";

const twoCards = () => ({
  sounds: [
    makeSound({ id: "a", path: "rain.mp3", x: 0, y: 0 }),
    makeSound({ id: "b", path: "wind.mp3", x: 400, y: 0 }),
  ],
});

const open = (board = twoCards(), settings = {}) =>
  openBoard(board, { app: appWithFiles("rain.mp3", "wind.mp3", "owl.mp3"), settings });

const selectedIds = (view: Awaited<ReturnType<typeof open>>["view"]) => [...view.selection.snapshot()].sort();

afterEach(() => {
  vi.useRealTimers();
});

describe("rendering", () => {
  it("draws a card per sound and a frame per scene", async () => {
    const { view } = await open({ ...twoCards(), scenes: [makeScene({ name: "Night" })] } as never);
    expect(cardEls(view)).toHaveLength(2);
    expect(sceneEls(view)).toHaveLength(1);
    expect(view.contentEl.querySelector(".sb-scene-title")?.textContent).toBe("Night");
    expect(cardEl(view, 0).querySelector(".sb-card-name")?.textContent).toBe("rain");
  });

  it("shows the hint only on an empty board", async () => {
    const empty = await openBoard();
    expect(empty.view.contentEl.querySelector(".sb-hint")?.classList.contains("is-hidden")).toBe(false);
    const full = await open();
    expect(full.view.contentEl.querySelector(".sb-hint")?.classList.contains("is-hidden")).toBe(true);
  });

  it("sizes cards from their data, falling back to the defaults", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", w: 333, h: 111 }), makeSound({ path: "wind.mp3", x: 500 })],
    });
    expect(cardEl(view, 0).style.width).toBe("333px");
    expect(cardEl(view, 0).style.height).toBe("111px");
    expect(cardEl(view, 1).style.width).toBe("220px");
    expect(cardEl(view, 1).style.height).toBe("84px");
  });

  it("marks cards whose file is missing", async () => {
    const { view } = await open({ sounds: [makeSound({ path: "ghost.mp3" })] });
    expect(cardEl(view).classList.contains("is-missing")).toBe(true);
  });

  it("marks nested soundboards", async () => {
    const { view } = await open({ sounds: [makeSound({ kind: "board", path: "Child.soundboard" })] });
    expect(cardEl(view).classList.contains("is-board")).toBe(true);
    expect(cardEl(view).querySelector(".sb-loop")).toBeNull();
  });

  it("shows the zoom level", async () => {
    const { view } = await open();
    expect(view.contentEl.querySelector(".sb-zoom")?.textContent).toBe("100%");
  });

  it("starts from an empty board when the file is not valid JSON", async () => {
    const { view, board } = await open();
    view.setViewData("{nope", true);
    expect(view.board.sounds).toEqual([]);
    expect(board).not.toBe(view.board);
  });

  it("saves the board as JSON", async () => {
    const { view } = await open();
    expect(JSON.parse(view.getViewData()).sounds).toHaveLength(2);
  });
});

describe("playing", () => {
  it("the play button starts and stops a card", async () => {
    const { view } = await open();
    const play = cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!;
    expect(play.dataset.icon).toBe("play");

    play.click();
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(false);
    expect(cardEl(view).classList.contains("is-playing")).toBe(true);
    expect(play.dataset.icon).toBe("pause");

    play.click();
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(true);
    expect(cardEl(view).classList.contains("is-playing")).toBe(false);
    expect(play.dataset.icon).toBe("play");
  });

  it("a finished non-looping sound goes back to the play state", async () => {
    const { view } = await open({ sounds: [makeSound({ path: "rain.mp3", loop: false })] });
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    FakeAudio.forPath("rain.mp3")!.end();
    expect(cardEl(view).classList.contains("is-playing")).toBe(false);
  });

  it("the loop button toggles looping, even while playing", async () => {
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-loop")!.click();
    expect(view.board.sounds[0].loop).toBe(false);
    expect(FakeAudio.forPath("rain.mp3")!.loop).toBe(false);
  });

  it("the volume slider changes the volume, and the card keeps that value", async () => {
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    const slider = cardEl(view).querySelector<HTMLInputElement>(".sb-vol")!;
    slider.value = "0.3";
    slider.dispatchEvent(new Event("input"));
    expect(view.board.sounds[0].volume).toBe(0.3);
    expect(FakeAudio.forPath("rain.mp3")!.volume).toBeCloseTo(0.3);
  });

  it("the scene button plays the cards inside, and the scene slider scales them", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 10, y: 10 }), makeSound({ path: "wind.mp3", x: 900, y: 900 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    view.contentEl.querySelector<HTMLButtonElement>(".sb-scene-play")!.click();
    await flush();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(false);
    expect(FakeAudio.forPath("wind.mp3")).toBeUndefined();
    expect(view.contentEl.querySelector(".sb-scene-count")?.textContent).toBe("1 of 1 playing");

    const slider = view.contentEl.querySelector<HTMLInputElement>(".sb-scene-vol")!;
    slider.value = "0.5";
    slider.dispatchEvent(new Event("input"));
    expect(FakeAudio.forPath("rain.mp3")!.volume).toBeCloseTo(0.5);
  });

  it("shows how many cards a scene holds", async () => {
    const { view } = await open({
      sounds: [makeSound({ x: 10, y: 10 }), makeSound({ x: 20, y: 100, path: "wind.mp3" })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 }), makeScene({ x: 2000, y: 2000 })],
    } as never);
    const counts = [...view.contentEl.querySelectorAll(".sb-scene-count")].map((e) => e.textContent);
    expect(counts).toEqual(["2 sounds", "empty"]);
  });

  it("removing a playing card stops it", async () => {
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-icon-btn")!.click();
    expect(view.board.sounds).toHaveLength(1);
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(true);
  });

  it("closing the view stops everything", async () => {
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    await view.onClose();
    expect(FakeAudio.forPath("rain.mp3")!.paused).toBe(true);
  });

  it("stopAll stops everything on the board", async () => {
    const { view } = await open();
    cardEls(view).forEach((c) => c.querySelector<HTMLButtonElement>(".sb-play")!.click());
    await flush();
    view.stopAll();
    expect(FakeAudio.instances.every((a) => a.paused)).toBe(true);
  });
});

describe("selecting", () => {
  it("clicking a card selects only it", async () => {
    const { view } = await open();
    pointer("pointerdown", cardEl(view, 0));
    pointer("pointerup", window);
    expect(selectedIds(view)).toEqual(["a"]);
    expect(cardEl(view, 0).classList.contains("is-selected")).toBe(true);

    pointer("pointerdown", cardEl(view, 1));
    pointer("pointerup", window);
    expect(selectedIds(view)).toEqual(["b"]);
  });

  it("shift-click and ctrl-click add and remove cards", async () => {
    const { view } = await open();
    pointer("pointerdown", cardEl(view, 0));
    pointer("pointerup", window);
    pointer("pointerdown", cardEl(view, 1), { shiftKey: true });
    pointer("pointerup", window);
    expect(selectedIds(view)).toEqual(["a", "b"]);

    pointer("pointerdown", cardEl(view, 0), { ctrlKey: true });
    pointer("pointerup", window);
    expect(selectedIds(view)).toEqual(["b"]);
  });

  it("clicking a card inside a multi-selection narrows the selection to it", async () => {
    const { view } = await open();
    view.selection.set(["a", "b"]);
    pointer("pointerdown", cardEl(view, 0));
    pointer("pointerup", window);
    expect(selectedIds(view)).toEqual(["a"]);
  });

  it("clicking empty space clears the selection", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    boxSelect(view, 900, 900, 900, 900);
    expect(selectedIds(view)).toEqual([]);
  });

  it("a box selects the cards it touches and the scenes it fully encloses", async () => {
    const { view } = await open({
      ...twoCards(),
      scenes: [
        makeScene({ id: "inner", x: 420, y: 150, w: 100, h: 100 }),
        makeScene({ id: "outer", x: -500, y: -500, w: 3000, h: 3000 }),
      ],
    } as never);
    boxSelect(view, -10, -10, 600, 300);
    expect(selectedIds(view)).toEqual(["a", "b", "inner"]);
  });

  it("ctrl while boxing adds to the current selection", async () => {
    const { view } = await open();
    view.selection.set(["b"]);
    boxSelect(view, -10, -10, 100, 100, { ctrlKey: true });
    expect(selectedIds(view)).toEqual(["a", "b"]);
  });

  it("a box without ctrl replaces the selection", async () => {
    const { view } = await open();
    view.selection.set(["b"]);
    boxSelect(view, -10, -10, 100, 100);
    expect(selectedIds(view)).toEqual(["a"]);
  });

  it("the box element is removed when the drag ends", async () => {
    const { view } = await open();
    boxSelect(view, 0, 0, 100, 100);
    expect(view.contentEl.querySelector(".sb-marquee")).toBeNull();
  });

  it("Ctrl+A selects everything, Escape clears", async () => {
    const { view } = await open({ ...twoCards(), scenes: [makeScene({ id: "s" })] } as never);
    ctrl(view, "a");
    expect(selectedIds(view)).toEqual(["a", "b", "s"]);
    key(view, "Escape");
    expect(selectedIds(view)).toEqual([]);
  });

  it("drops selections of nodes that no longer exist", async () => {
    const { view } = await open();
    view.selection.set(["a", "ghost"]);
    view.render();
    expect(selectedIds(view)).toEqual(["a"]);
  });
});

describe("moving and resizing", () => {
  it("dragging a card moves it by the pointer distance", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    expect(view.board.sounds[0]).toMatchObject({ x: 50, y: 30 });
    expect(cardEl(view, 0).style.left).toBe("50px");
  });

  it("movement is divided by the zoom level", async () => {
    const { view } = await open();
    view.board.view.zoom = 2;
    dragBy(cardEl(view, 0), 50, 30);
    expect(view.board.sounds[0]).toMatchObject({ x: 25, y: 15 });
  });

  it("a click without movement does not move the card", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 1, 1);
    expect(view.board.sounds[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("dragging a selected card moves the whole selection", async () => {
    const { view } = await open();
    view.selection.set(["a", "b"]);
    dragBy(cardEl(view, 0), 10, 20);
    expect(view.board.sounds.map((s) => [s.x, s.y])).toEqual([
      [10, 20],
      [410, 20],
    ]);
  });

  it("dragging a scene header moves the cards inside it", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 10, y: 10 }), makeSound({ path: "wind.mp3", x: 900, y: 900 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    dragBy(view.contentEl.querySelector<HTMLElement>(".sb-scene-head")!, 100, 100);
    expect(view.board.scenes[0]).toMatchObject({ x: 100, y: 100 });
    expect(view.board.sounds[0]).toMatchObject({ x: 110, y: 110 });
    expect(view.board.sounds[1]).toMatchObject({ x: 900, y: 900 });
  });

  it("moving a card out of a scene changes the scene's count", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 10, y: 10 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    expect(view.contentEl.querySelector(".sb-scene-count")?.textContent).toBe("1 sound");
    dragBy(cardEl(view), 1000, 1000);
    expect(view.contentEl.querySelector(".sb-scene-count")?.textContent).toBe("empty");
  });

  it("the corner handle resizes a card without moving it", async () => {
    const { view } = await open();
    dragBy(cardEl(view).querySelector<HTMLElement>(".sb-resize")!, 100, 40);
    expect(view.board.sounds[0]).toMatchObject({ x: 0, y: 0, w: 320, h: 124 });
    expect(cardEl(view).style.width).toBe("320px");
  });

  it("a card cannot be resized below its minimum size", async () => {
    const { view } = await open();
    dragBy(cardEl(view).querySelector<HTMLElement>(".sb-resize")!, -900, -900);
    expect(view.board.sounds[0]).toMatchObject({ w: 170, h: 76 });
  });

  it("resizing is divided by the zoom level", async () => {
    const { view } = await open();
    view.board.view.zoom = 2;
    dragBy(cardEl(view).querySelector<HTMLElement>(".sb-resize")!, 100, 40);
    expect(view.board.sounds[0]).toMatchObject({ w: 270, h: 104 });
  });

  it("a resized card is used when working out scene membership", async () => {
    const { view } = await open({
      sounds: [makeSound({ path: "rain.mp3", x: 250, y: 10 })],
      scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    expect(view.contentEl.querySelector(".sb-scene-count")?.textContent).toBe("1 sound"); // centre x = 360
    dragBy(cardEl(view).querySelector<HTMLElement>(".sb-resize")!, 400, 0);
    expect(view.contentEl.querySelector(".sb-scene-count")?.textContent).toBe("empty"); // centre x = 560
  });

  it("the corner handle resizes a scene, down to a minimum width", async () => {
    const { view } = await open({ scenes: [makeScene({ x: 0, y: 0, w: 500, h: 300 })] } as never);
    const grip = view.contentEl.querySelector<HTMLElement>(".sb-scene .sb-resize")!;
    dragBy(grip, 100, 50);
    expect(view.board.scenes[0]).toMatchObject({ w: 600, h: 350 });
    dragBy(view.contentEl.querySelector<HTMLElement>(".sb-scene .sb-resize")!, -2000, -2000);
    expect(view.board.scenes[0].w).toBe(340);
  });
});

describe("panning and zooming", () => {
  const panned = (view: Awaited<ReturnType<typeof open>>["view"]) => [view.board.view.x, view.board.view.y];

  it("shift+drag on empty space pans", async () => {
    const { view } = await open();
    dragBy(view.viewportEl, 40, 20, { shiftKey: true, clientX: 900, clientY: 900 });
    expect(panned(view)).toEqual([40, 20]);
  });

  it("the middle mouse button pans", async () => {
    const { view } = await open();
    dragBy(view.viewportEl, 15, 5, { button: 1, clientX: 900, clientY: 900 });
    expect(panned(view)).toEqual([15, 5]);
  });

  it("space + drag pans", async () => {
    const { view } = await open();
    key(view, " ");
    expect(view.viewportEl.classList.contains("is-pan-ready")).toBe(true);
    dragBy(view.viewportEl, 30, 30, { clientX: 900, clientY: 900 });
    expect(panned(view)).toEqual([30, 30]);
  });

  it("losing focus releases the space key", async () => {
    const { view } = await open();
    key(view, " ");
    view.contentEl.dispatchEvent(new FocusEvent("focusout"));
    expect(view.viewportEl.classList.contains("is-pan-ready")).toBe(false);
  });

  it("a plain drag on empty space selects, not pans", async () => {
    const { view } = await open();
    dragBy(view.viewportEl, 40, 20, { clientX: 900, clientY: 900 });
    expect(panned(view)).toEqual([0, 0]);
  });

  it("with the pan-by-default setting, plain drag pans and shift selects", async () => {
    const { view, plugin } = await open();
    plugin.settings.panByDefault = true;
    view.syncToolbar();
    expect(view.viewportEl.classList.contains("is-pan-ready")).toBe(true);

    dragBy(view.viewportEl, 40, 20, { clientX: 900, clientY: 900 });
    expect(panned(view)).toEqual([40, 20]);

    boxSelect(view, 900, 900, 1000, 1000, { shiftKey: true });
    expect(panned(view)).toEqual([40, 20]);
  });

  it("the mouse wheel zooms, within limits", async () => {
    const { view } = await open();
    const wheel = (deltaY: number) =>
      view.viewportEl.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
    wheel(-200);
    expect(view.board.view.zoom).toBeGreaterThan(1);
    for (let i = 0; i < 50; i++) wheel(-500);
    expect(view.board.view.zoom).toBe(2.5);
    for (let i = 0; i < 100; i++) wheel(500);
    expect(view.board.view.zoom).toBe(0.25);
  });

  it("zooming around the pointer keeps the point under it fixed", async () => {
    const { view } = await open();
    view.board.view = { x: 100, y: 100, zoom: 1 };
    view.viewportEl.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -300, clientX: 200, clientY: 200, bubbles: true, cancelable: true })
    );
    const v = view.board.view;
    expect((200 - v.x) / v.zoom).toBeCloseTo(100); // the board point under the pointer was (100, 100)
  });

  it("the zoom button resets to 100%", async () => {
    const { view } = await open();
    view.board.view.zoom = 2;
    view.contentEl.querySelector<HTMLButtonElement>(".sb-zoom")!.click();
    expect(view.board.view.zoom).toBe(1);
    expect(view.contentEl.querySelector(".sb-zoom")?.textContent).toBe("100%");
  });
});

describe("keyboard shortcuts", () => {
  it("Delete removes the selected nodes", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    key(view, "Delete");
    expect(view.board.sounds.map((s) => s.id)).toEqual(["b"]);
    expect(selectedIds(view)).toEqual([]);
    expect(cardEls(view)).toHaveLength(1);
  });

  it("Backspace also deletes", async () => {
    const { view } = await open();
    view.selection.set(["a", "b"]);
    key(view, "Backspace");
    expect(view.board.sounds).toEqual([]);
  });

  it("deleting a scene keeps the cards inside it", async () => {
    const { view } = await open({
      sounds: [makeSound({ id: "a", path: "rain.mp3", x: 10, y: 10 })],
      scenes: [makeScene({ id: "s", x: 0, y: 0, w: 500, h: 300 })],
    } as never);
    view.selection.set(["s"]);
    key(view, "Delete");
    expect(view.board.scenes).toEqual([]);
    expect(view.board.sounds).toHaveLength(1);
  });

  it("Ctrl+C then Ctrl+V pastes copies and selects them", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    ctrl(view, "c");
    ctrl(view, "v");
    expect(view.board.sounds).toHaveLength(3);
    const pasted = view.board.sounds[2];
    expect(pasted.id).not.toBe("a");
    expect(pasted.path).toBe("rain.mp3");
    expect(selectedIds(view)).toEqual([pasted.id]);
  });

  it("repeated pastes in the same place are nudged apart", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    ctrl(view, "c");
    ctrl(view, "v");
    ctrl(view, "v");
    const [, , first, second] = view.board.sounds;
    expect([second.x - first.x, second.y - first.y]).toEqual([24, 24]);
  });

  it("keys are ignored while typing in a text field", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    const input = document.createElement("input");
    view.contentEl.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(view.board.sounds).toHaveLength(2);
  });

  it("keys still work after using a volume slider", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    const slider = cardEl(view).querySelector<HTMLInputElement>(".sb-vol")!;
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(view.board.sounds).toHaveLength(1);
  });
});

describe("undo and redo", () => {
  it("Ctrl+Z undoes a move and Ctrl+Shift+Z redoes it", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    ctrl(view, "z");
    expect(view.board.sounds[0]).toMatchObject({ x: 0, y: 0 });
    expect(cardEl(view, 0).style.left).toBe("0px");
    ctrl(view, "z", { shiftKey: true });
    expect(view.board.sounds[0]).toMatchObject({ x: 50, y: 30 });
  });

  it("Ctrl+Y also redoes", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    ctrl(view, "z");
    ctrl(view, "y");
    expect(view.board.sounds[0].x).toBe(50);
  });

  it("undoes a delete and brings the card back", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    key(view, "Delete");
    ctrl(view, "z");
    expect(view.board.sounds.map((s) => s.id)).toEqual(["a", "b"]);
    expect(cardEls(view)).toHaveLength(2);
  });

  it("undoes a resize", async () => {
    const { view } = await open();
    dragBy(cardEl(view).querySelector<HTMLElement>(".sb-resize")!, 100, 100);
    ctrl(view, "z");
    expect(view.board.sounds[0].w).toBeUndefined();
    expect(cardEl(view).style.width).toBe("220px");
  });

  it("undoes a paste", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    ctrl(view, "c");
    ctrl(view, "v");
    ctrl(view, "z");
    expect(view.board.sounds).toHaveLength(2);
  });

  it("a slider drag is one undo step", async () => {
    const { view } = await open();
    const slider = cardEl(view).querySelector<HTMLInputElement>(".sb-vol")!;
    for (const v of ["0.9", "0.7", "0.5", "0.3"]) {
      slider.value = v;
      slider.dispatchEvent(new Event("input"));
    }
    ctrl(view, "z");
    expect(view.board.sounds[0].volume).toBe(1);
  });

  it("a scene volume drag is one undo step", async () => {
    const { view } = await open({ scenes: [makeScene({})] } as never);
    const slider = view.contentEl.querySelector<HTMLInputElement>(".sb-scene-vol")!;
    for (const v of ["0.8", "0.4"]) {
      slider.value = v;
      slider.dispatchEvent(new Event("input"));
    }
    ctrl(view, "z");
    expect(view.board.scenes[0].volume).toBe(1);
  });

  it("panning and zooming are not undoable", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    dragBy(view.viewportEl, 40, 20, { shiftKey: true, clientX: 900, clientY: 900 });
    view.viewportEl.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true }));
    ctrl(view, "z"); // undoes the card move, not the pan
    expect(view.board.sounds[0].x).toBe(0);
    expect(view.board.view.x).not.toBe(0);
  });

  it("undo with nothing to undo does nothing", async () => {
    const { view } = await open();
    ctrl(view, "z");
    expect(view.board.sounds).toHaveLength(2);
  });

  it("undoing a paste stops the pasted card if it was playing", async () => {
    const { view } = await open();
    view.selection.set(["a"]);
    ctrl(view, "c");
    ctrl(view, "v");
    cardEls(view)[2].querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    const audio = FakeAudio.instances[0];
    expect(audio.paused).toBe(false);
    ctrl(view, "z");
    expect(audio.paused).toBe(true);
  });

  it("cards that survive an undo keep playing", async () => {
    const { view } = await open();
    cardEl(view, 1).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    dragBy(cardEl(view, 0), 50, 30);
    ctrl(view, "z");
    expect(FakeAudio.forPath("wind.mp3")!.paused).toBe(false);
    expect(cardEl(view, 1).classList.contains("is-playing")).toBe(true);
  });

  it("undo applies the loop flag from the restored state", async () => {
    const { view } = await open();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-play")!.click();
    await flush();
    cardEl(view).querySelector<HTMLButtonElement>(".sb-loop")!.click();
    ctrl(view, "z");
    expect(view.board.sounds[0].loop).toBe(true);
    expect(FakeAudio.forPath("rain.mp3")!.loop).toBe(true);
  });

  it("a newly opened file starts with a clean history", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    view.setViewData(JSON.stringify({ sounds: [], scenes: [] }), true);
    ctrl(view, "z");
    expect(view.board.sounds).toEqual([]);
  });

  it("an outside change to the file is itself undoable", async () => {
    const { view } = await open();
    view.setViewData(JSON.stringify({ sounds: [], scenes: [] }), false);
    expect(view.board.sounds).toEqual([]);
    ctrl(view, "z");
    expect(view.board.sounds).toHaveLength(2);
  });

  it("our own save echoing back does not add an undo step", async () => {
    const { view } = await open();
    dragBy(cardEl(view, 0), 50, 30);
    view.setViewData(view.getViewData(), false);
    ctrl(view, "z");
    expect(view.board.sounds[0].x).toBe(0);
  });
});

describe("saving", () => {
  it("requests a save after a change", async () => {
    const { view } = await open();
    const before = view.saveRequests;
    dragBy(cardEl(view, 0), 50, 30);
    expect(view.saveRequests).toBeGreaterThan(before);
  });
});

describe("scene renaming", () => {
  const title = (view: Awaited<ReturnType<typeof open>>["view"]) =>
    view.contentEl.querySelector<HTMLElement>(".sb-scene-title")!;

  it("double-clicking the title lets you rename it", async () => {
    const { view } = await open({ scenes: [makeScene({ name: "Old" })] } as never);
    title(view).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = view.contentEl.querySelector<HTMLInputElement>(".sb-rename")!;
    expect(input.value).toBe("Old");
    input.value = "Fresh";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(view.board.scenes[0].name).toBe("Fresh");
    expect(title(view).textContent).toBe("Fresh");
  });

  it("Escape cancels", async () => {
    const { view } = await open({ scenes: [makeScene({ name: "Old" })] } as never);
    title(view).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = view.contentEl.querySelector<HTMLInputElement>(".sb-rename")!;
    input.value = "Nope";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(view.board.scenes[0].name).toBe("Old");
  });

  it("an empty name keeps the old one", async () => {
    const { view } = await open({ scenes: [makeScene({ name: "Old" })] } as never);
    title(view).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = view.contentEl.querySelector<HTMLInputElement>(".sb-rename")!;
    input.value = "   ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(view.board.scenes[0].name).toBe("Old");
  });

  it("renaming a scene can be undone", async () => {
    const { view } = await open({ scenes: [makeScene({ name: "Old" })] } as never);
    title(view).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = view.contentEl.querySelector<HTMLInputElement>(".sb-rename")!;
    input.value = "Fresh";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    ctrl(view, "z");
    expect(view.board.scenes[0].name).toBe("Old");
  });
});
