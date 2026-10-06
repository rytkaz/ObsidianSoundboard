import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockSize, gridColumns, layoutNewCards } from "../src/layout";
import { CARD_H, CARD_W, Point } from "../src/types";
import { makeBoard, makeSound } from "./helpers/builders";

/** True when two default-sized cards at these positions physically overlap. */
const overlap = (a: Point, b: Point, wa = CARD_W, ha = CARD_H, wb = CARD_W, hb = CARD_H) =>
  a.x < b.x + wb && a.x + wa > b.x && a.y < b.y + hb && a.y + ha > b.y;

describe("gridColumns", () => {
  it("never exceeds the number of cards", () => {
    expect(gridColumns(1)).toBe(1);
    expect(gridColumns(2)).toBeLessThanOrEqual(2);
  });

  it("grows with the count but stops at six columns", () => {
    expect(gridColumns(10)).toBeGreaterThan(gridColumns(2));
    expect(gridColumns(500)).toBe(6);
  });
});

describe("blockSize", () => {
  it("fits the grid it describes", () => {
    const { w, h } = blockSize(10);
    const cols = gridColumns(10);
    expect(w).toBe(cols * (CARD_W + 20) - 20);
    expect(h).toBe(Math.ceil(10 / cols) * (CARD_H + 20) - 20);
  });
});

describe("layoutNewCards", () => {
  it("starts at the origin on an empty board and fills row by row", () => {
    const spots = layoutNewCards(makeBoard(), 4, { x: 100, y: 200 });
    expect(spots).toHaveLength(4);
    expect(spots[0]).toEqual({ x: 100, y: 200 });
    expect(spots[1].y).toBe(200);
    expect(spots[1].x).toBeGreaterThan(100);
  });

  it("skips slots taken by existing cards", () => {
    const board = makeBoard({ sounds: [makeSound({ x: 0, y: 0 })] });
    const [first] = layoutNewCards(board, 1, { x: 0, y: 0 });
    expect(overlap(first, { x: 0, y: 0 })).toBe(false);
  });

  it("avoids cards that were resized larger", () => {
    const board = makeBoard({ sounds: [makeSound({ x: 0, y: 0, w: 700, h: 200 })] });
    const spots = layoutNewCards(board, 3, { x: 0, y: 0 });
    for (const s of spots) expect(overlap(s, { x: 0, y: 0 }, CARD_W, CARD_H, 700, 200)).toBe(false);
  });

  it("stacks leftovers below everything when the board is hopelessly crowded", () => {
    const board = makeBoard({ sounds: [makeSound({ x: 0, y: 0, w: 1e6, h: 1e6 })] });
    const [spot] = layoutNewCards(board, 1, { x: 0, y: 0 });
    expect(spot.y).toBeGreaterThanOrEqual(1e6);
  });

  it("returns an empty list for zero cards", () => {
    expect(layoutNewCards(makeBoard(), 0, { x: 0, y: 0 })).toEqual([]);
  });

  it("property: new cards never overlap existing cards or each other", () => {
    const point = fc.record({ x: fc.integer({ min: -600, max: 600 }), y: fc.integer({ min: -400, max: 400 }) });
    fc.assert(
      fc.property(
        fc.array(point, { maxLength: 25 }),
        fc.integer({ min: 1, max: 30 }),
        point,
        (existing, count, origin) => {
          const board = makeBoard({ sounds: existing.map((p) => makeSound(p)) });
          const spots = layoutNewCards(board, count, origin);
          expect(spots).toHaveLength(count);
          spots.forEach((s, i) => {
            for (const e of existing) expect(overlap(s, e)).toBe(false);
            for (const other of spots.slice(i + 1)) expect(overlap(s, other)).toBe(false);
          });
        }
      )
    );
  });
});
