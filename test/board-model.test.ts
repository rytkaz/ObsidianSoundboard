import { describe, expect, it, vi } from "vitest";
import {
  allNodeIds,
  applySnapshot,
  cardSize,
  contentSnapshot,
  emptyBoard,
  nodesInRect,
  parseBoard,
  remapBoardText,
  sceneGainOf,
  soundsIn,
  within,
} from "../src/board-model";
import { CARD_H, CARD_W } from "../src/types";
import { makeBoard, makeScene, makeSound } from "./helpers/builders";

describe("parseBoard", () => {
  it("reads a valid board", () => {
    const board = makeBoard({ sounds: [makeSound({ id: "s1" })] });
    expect(parseBoard(JSON.stringify(board)).sounds[0].id).toBe("s1");
  });

  it("fills in missing fields", () => {
    const parsed = parseBoard("{}");
    expect(parsed).toEqual(emptyBoard());
  });

  it("treats an empty file as an empty board", () => {
    expect(parseBoard("")).toEqual(emptyBoard());
  });

  it("falls back to an empty board and reports invalid JSON", () => {
    const onError = vi.fn();
    expect(parseBoard("{nope", onError)).toEqual(emptyBoard());
    expect(onError).toHaveBeenCalledOnce();
  });

  it("ignores non-array sounds and scenes", () => {
    const parsed = parseBoard(JSON.stringify({ sounds: "x", scenes: 5 }));
    expect(parsed.sounds).toEqual([]);
    expect(parsed.scenes).toEqual([]);
  });

  it("merges a partial view over the defaults", () => {
    const parsed = parseBoard(JSON.stringify({ view: { zoom: 2 } }));
    expect(parsed.view).toEqual({ ...emptyBoard().view, zoom: 2 });
  });
});

describe("snapshots", () => {
  it("round-trips cards and scenes but ignores pan/zoom", () => {
    const board = makeBoard({ sounds: [makeSound({ id: "a", x: 5 })], scenes: [makeScene({ id: "sc" })] });
    const snap = contentSnapshot(board);

    const other = makeBoard({ view: { x: 9, y: 9, zoom: 3 } });
    applySnapshot(other, snap);
    expect(other.sounds).toEqual(board.sounds);
    expect(other.scenes).toEqual(board.scenes);
    expect(other.view).toEqual({ x: 9, y: 9, zoom: 3 });
  });

  it("does not change when only the view changes", () => {
    const board = makeBoard({ sounds: [makeSound()] });
    const before = contentSnapshot(board);
    board.view.x = 500;
    expect(contentSnapshot(board)).toBe(before);
  });
});

describe("cardSize", () => {
  it("uses the defaults unless the card has its own size", () => {
    expect(cardSize(makeSound())).toEqual({ w: CARD_W, h: CARD_H });
    expect(cardSize(makeSound({ w: 300, h: 100 }))).toEqual({ w: 300, h: 100 });
  });
});

describe("scene membership", () => {
  const scene = makeScene({ x: 0, y: 0, w: 400, h: 300 });

  it("uses the card's centre", () => {
    expect(within(makeSound({ x: 50, y: 50 }), scene)).toBe(true);
    // The centre of this card (x = 410) is just past the scene's right edge (x = 400).
    expect(within(makeSound({ x: 300, y: 50 }), scene)).toBe(false);
    expect(within(makeSound({ x: 289, y: 50 }), scene)).toBe(true);
  });

  it("takes a resized card's centre into account", () => {
    const wide = makeSound({ x: 300, y: 50, w: 400 });
    expect(within(wide, scene)).toBe(false);
    expect(within(makeSound({ x: 300, y: 50, w: 100 }), scene)).toBe(true);
  });

  it("soundsIn lists only members", () => {
    const inside = makeSound({ x: 10, y: 10 });
    const outside = makeSound({ x: 900, y: 900 });
    expect(soundsIn(makeBoard({ sounds: [inside, outside], scenes: [scene] }), scene)).toEqual([inside]);
  });
});

describe("sceneGainOf", () => {
  it("is 1 outside any scene", () => {
    expect(sceneGainOf(makeBoard({ scenes: [makeScene({ volume: 0.5 })] }), makeSound({ x: 999, y: 999 }))).toBe(1);
  });

  it("multiplies the volumes of every scene the card is in", () => {
    const board = makeBoard({
      scenes: [makeScene({ volume: 0.5 }), makeScene({ volume: 0.5 }), makeScene({ x: 2000, volume: 0.1 })],
    });
    expect(sceneGainOf(board, makeSound({ x: 10, y: 10 }))).toBeCloseTo(0.25);
  });

  it("treats a missing volume as 1", () => {
    const board = makeBoard({ scenes: [makeScene({ volume: undefined })] });
    expect(sceneGainOf(board, makeSound({ x: 10, y: 10 }))).toBe(1);
  });
});

describe("nodesInRect", () => {
  const touching = makeSound({ id: "touch", x: 90, y: 0 });
  const far = makeSound({ id: "far", x: 1000, y: 1000 });
  const small = makeScene({ id: "small", x: 10, y: 10, w: 50, h: 50 });
  const big = makeScene({ id: "big", x: -500, y: -500, w: 2000, h: 2000 });
  const board = makeBoard({ sounds: [touching, far], scenes: [small, big] });

  it("selects cards that merely touch the rectangle", () => {
    expect(nodesInRect(board, 0, 0, 100, 100)).toContain("touch");
    expect(nodesInRect(board, 0, 0, 100, 100)).not.toContain("far");
  });

  it("selects scenes only when completely enclosed", () => {
    const ids = nodesInRect(board, 0, 0, 100, 100);
    expect(ids).toContain("small");
    expect(ids).not.toContain("big");
  });

  it("returns nothing for an empty area", () => {
    expect(nodesInRect(board, 5000, 5000, 5100, 5100)).toEqual([]);
  });
});

describe("allNodeIds", () => {
  it("lists cards and scenes", () => {
    const board = makeBoard({ sounds: [makeSound({ id: "a" })], scenes: [makeScene({ id: "b" })] });
    expect([...allNodeIds(board)].sort()).toEqual(["a", "b"]);
  });
});

describe("remapBoardText", () => {
  const text = (...paths: string[]) => JSON.stringify({ sounds: paths.map((path) => ({ path })) });
  const paths = (raw: string) => JSON.parse(raw).sounds.map((s: { path: string }) => s.path);

  it("applies renames to matching paths", () => {
    const out = remapBoardText(text("Old/a.mp3", "Other/b.mp3"), [{ oldPath: "Old", newPath: "New" }]);
    expect(paths(out)).toEqual(["New/a.mp3", "Other/b.mp3"]);
  });

  it("applies several renames in order", () => {
    const out = remapBoardText(text("A/x.mp3"), [
      { oldPath: "A", newPath: "B" },
      { oldPath: "B/x.mp3", newPath: "B/y.mp3" },
    ]);
    expect(paths(out)).toEqual(["B/y.mp3"]);
  });

  it("returns the original text when nothing matches", () => {
    const raw = text("a.mp3");
    expect(remapBoardText(raw, [{ oldPath: "zzz", newPath: "yyy" }])).toBe(raw);
  });

  it("returns invalid JSON unchanged", () => {
    expect(remapBoardText("{broken", [{ oldPath: "a", newPath: "b" }])).toBe("{broken");
  });

  it("copes with a file that has no sounds", () => {
    expect(remapBoardText("{}", [{ oldPath: "a", newPath: "b" }])).toBe("{}");
  });
});
