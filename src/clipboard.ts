/** Copy and paste of nodes. The clipboard is shared by all boards, so nodes can move between them. */

import { soundsIn } from "./board-model";
import { BoardData, Clip, Point, Sound } from "./types";
import { uid } from "./utils";

let clip: Clip | null = null;

export const hasClipboard = () => clip !== null;

/** Copies the given nodes. A copied scene brings along the cards inside it. Returns the item count. */
export function copyNodes(board: BoardData, ids: ReadonlySet<string>): number {
  const scenes = board.scenes.filter((sc) => ids.has(sc.id));
  const sounds = new Map<string, Sound>();
  for (const s of board.sounds) if (ids.has(s.id)) sounds.set(s.id, s);
  for (const sc of scenes) for (const s of soundsIn(board, sc)) sounds.set(s.id, s);

  const count = sounds.size + scenes.length;
  if (count) clip = JSON.parse(JSON.stringify({ sounds: [...sounds.values()], scenes }));
  return count;
}

export interface PasteResult {
  /** Ids of the new nodes. */
  ids: string[];
  /** True when a nested soundboard was left out because it would contain itself. */
  skippedSelf: boolean;
}

/**
 * Adds a copy of the clipboard to the board with its top-left corner at `at` (plus `bump`).
 * Returns null when the clipboard is empty.
 */
export function pasteNodes(board: BoardData, at: Point, bump: number, selfPath?: string): PasteResult | null {
  if (!clip) return null;
  const copy: Clip = JSON.parse(JSON.stringify(clip));
  const sounds = copy.sounds.filter((s) => !(s.kind === "board" && s.path === selfPath));
  const skippedSelf = sounds.length < copy.sounds.length;

  const items = [...sounds, ...copy.scenes];
  if (!items.length) return { ids: [], skippedSelf };

  const dx = Math.round(at.x - Math.min(...items.map((i) => i.x)) + bump);
  const dy = Math.round(at.y - Math.min(...items.map((i) => i.y)) + bump);
  for (const item of items) {
    item.id = uid();
    item.x += dx;
    item.y += dy;
  }
  board.sounds.push(...sounds);
  board.scenes.push(...copy.scenes);
  return { ids: items.map((i) => i.id), skippedSelf };
}
