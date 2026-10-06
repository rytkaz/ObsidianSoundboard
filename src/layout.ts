/** Places new cards on the board in a tidy grid that avoids the cards already there. */

import { cardSize } from "./board-model";
import { BoardData, CARD_H, CARD_W, Point } from "./types";
import { clamp } from "./utils";

const GAP = 20;
const STEP_X = CARD_W + GAP;
const STEP_Y = CARD_H + GAP;
/** Cards closer than this count as overlapping. */
const MARGIN = 8;
const MAX_COLUMNS = 6;
const MAX_TRIES = 5000;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Number of columns for a block of `count` cards: roughly square, a little wider than tall. */
export function gridColumns(count: number) {
  return Math.min(count, clamp(Math.ceil(Math.sqrt(count * 1.6)), 1, MAX_COLUMNS));
}

/** Size of the grid block `count` cards would form on an empty board. */
export function blockSize(count: number) {
  const cols = gridColumns(count);
  const rows = Math.ceil(count / cols);
  return { w: cols * STEP_X - GAP, h: rows * STEP_Y - GAP };
}

function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w + MARGIN && a.x + a.w + MARGIN > b.x && a.y < b.y + b.h + MARGIN && a.y + a.h + MARGIN > b.y
  );
}

/**
 * Returns `count` top-left positions, filling a grid row by row from `origin`
 * and skipping any slot that would overlap an existing card or an earlier new one.
 */
export function layoutNewCards(board: BoardData, count: number, origin: Point): Point[] {
  const cols = gridColumns(count);
  const taken: Rect[] = board.sounds.map((s) => ({ x: s.x, y: s.y, ...cardSize(s) }));
  const spots: Point[] = [];

  for (let i = 0; spots.length < count && i < MAX_TRIES; i++) {
    const slot: Rect = {
      x: Math.round(origin.x + (i % cols) * STEP_X),
      y: Math.round(origin.y + Math.floor(i / cols) * STEP_Y),
      w: CARD_W,
      h: CARD_H,
    };
    if (taken.some((t) => overlaps(t, slot))) continue;
    spots.push({ x: slot.x, y: slot.y });
    taken.push(slot);
  }

  // Extremely crowded boards: stack whatever is left below everything.
  let y = Math.max(origin.y, ...taken.map((t) => t.y + t.h + GAP));
  while (spots.length < count) {
    spots.push({ x: Math.round(origin.x), y: Math.round(y) });
    y += STEP_Y;
  }
  return spots;
}
