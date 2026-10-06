/** Pure helpers for reading and querying board data. */

import { BoardData, CARD_H, CARD_W, Scene, Sound } from "./types";
import { remapPath } from "./utils";

export const emptyBoard = (): BoardData => ({ view: { x: 40, y: 80, zoom: 1 }, sounds: [], scenes: [] });

/** Reads a `.soundboard` file's text. Falls back to an empty board if it is not valid JSON. */
export function parseBoard(raw: string, onError?: () => void): BoardData {
  try {
    const d = JSON.parse(raw || "{}");
    return {
      view: { ...emptyBoard().view, ...(d.view ?? {}) },
      sounds: Array.isArray(d.sounds) ? d.sounds : [],
      scenes: Array.isArray(d.scenes) ? d.scenes : [],
    };
  } catch {
    onError?.();
    return emptyBoard();
  }
}

/** The text used by undo/redo: cards and scenes, without pan/zoom. */
export function contentSnapshot(board: BoardData) {
  return JSON.stringify({ sounds: board.sounds, scenes: board.scenes });
}

/** Replaces the board's cards and scenes with those from a snapshot. */
export function applySnapshot(board: BoardData, snapshot: string) {
  const d = JSON.parse(snapshot);
  board.sounds = d.sounds;
  board.scenes = d.scenes;
}

/** A card's size: its own, or the default. */
export function cardSize(s: Sound) {
  return { w: s.w ?? CARD_W, h: s.h ?? CARD_H };
}

/** A card belongs to a scene when its centre lies inside the scene frame. */
export function within(s: Sound, sc: Scene) {
  const { w, h } = cardSize(s);
  const cx = s.x + w / 2;
  const cy = s.y + h / 2;
  return cx >= sc.x && cx <= sc.x + sc.w && cy >= sc.y && cy <= sc.y + sc.h;
}

export function soundsIn(board: BoardData, sc: Scene) {
  return board.sounds.filter((s) => within(s, sc));
}

/** Product of the volumes of every scene the card sits in. */
export function sceneGainOf(board: BoardData, s: Sound) {
  let gain = 1;
  for (const sc of board.scenes) if (within(s, sc)) gain *= sc.volume ?? 1;
  return gain;
}

export function allNodeIds(board: BoardData) {
  return new Set([...board.sounds.map((s) => s.id), ...board.scenes.map((s) => s.id)]);
}

/** Cards that touch the rectangle, and scenes that sit completely inside it. */
export function nodesInRect(board: BoardData, x1: number, y1: number, x2: number, y2: number) {
  const ids: string[] = [];
  for (const s of board.sounds) {
    const { w, h } = cardSize(s);
    if (s.x < x2 && s.x + w > x1 && s.y < y2 && s.y + h > y1) ids.push(s.id);
  }
  for (const sc of board.scenes) {
    if (sc.x >= x1 && sc.y >= y1 && sc.x + sc.w <= x2 && sc.y + sc.h <= y2) ids.push(sc.id);
  }
  return ids;
}

export interface Rename {
  oldPath: string;
  newPath: string;
}

/**
 * Applies renames, in order, to the sound paths in a `.soundboard` file's text.
 * Returns the text unchanged when nothing matched.
 */
export function remapBoardText(raw: string, renames: Rename[]) {
  try {
    const data = JSON.parse(raw);
    let changed = false;
    for (const s of data.sounds ?? []) {
      for (const r of renames) {
        const updated = remapPath(s.path, r.oldPath, r.newPath);
        if (updated !== s.path) {
          s.path = updated;
          changed = true;
        }
      }
    }
    return changed ? JSON.stringify(data, null, 2) : raw;
  } catch {
    return raw;
  }
}
