/** Things you can do to nodes: select, copy, paste, delete, rename. */

import { Notice, TFile, normalizePath } from "obsidian";
import { allNodeIds, applySnapshot } from "../board-model";
import { copyNodes, pasteNodes } from "../clipboard";
import type { Point, Sound } from "../types";
import { plural, validateFileName } from "../utils";
import type { BoardHost } from "./host";
import { RenameModal } from "./modals";

const PASTE_NUDGE = 24;

export class NodeActions {
  private lastPasteKey = "";
  private pasteCount = 0;

  constructor(private host: BoardHost) {}

  selectAll() {
    this.host.selection.set(allNodeIds(this.host.board));
  }

  copySelected() {
    const count = copyNodes(this.host.board, this.host.selection.snapshot());
    if (count) new Notice(`Copied ${plural(count, "item")}`);
  }

  /**
   * Pastes at a screen position; defaults to the pointer, or the middle of the
   * view when the pointer is elsewhere. Repeated pastes at the same spot are nudged apart.
   */
  paste(client?: Point) {
    const { board, camera, viewportEl, interactions, selection } = this.host;
    const r = viewportEl.getBoundingClientRect();
    const spot = client ?? interactions.lastClient ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };

    const key = `${spot.x},${spot.y}`;
    this.pasteCount = key === this.lastPasteKey ? this.pasteCount + 1 : 0;
    this.lastPasteKey = key;

    const result = pasteNodes(board, camera.toWorld(spot.x, spot.y), this.pasteCount * PASTE_NUDGE, this.host.filePath);
    if (!result) return;
    if (result.skippedSelf)
      new Notice("Soundboard: a soundboard cannot be nested inside itself, so it was not pasted.");
    if (!result.ids.length) return;

    this.host.scheduleSave();
    this.host.render();
    selection.set(result.ids);
  }

  /** Deletes the selection. Cards inside a deleted scene are kept unless they are selected too. */
  deleteSelected() {
    this.deleteIds([...this.host.selection.snapshot()]);
  }

  deleteIds(ids: string[]) {
    if (!ids.length) return;
    const { board, playback, selection } = this.host;
    const doomed = new Set(ids);

    board.sounds.filter((s) => doomed.has(s.id)).forEach((s) => playback.removeUnit(s));
    board.sounds = board.sounds.filter((s) => !doomed.has(s.id));
    board.scenes = board.scenes.filter((sc) => !doomed.has(sc.id));
    selection.clear();

    this.host.scheduleSave();
    this.host.render();
  }

  undo() {
    this.restore(this.host.history.undo());
  }

  redo() {
    this.restore(this.host.history.redo());
  }

  /** Puts the board back to a history snapshot. */
  private restore(snapshot: string | null) {
    if (snapshot === null) return;
    const { board, playback } = this.host;
    const before = board.sounds;
    applySnapshot(board, snapshot);

    // Cards that no longer exist must stop playing; the rest keep their audio.
    const live = new Set(board.sounds.map((s) => s.id));
    before.filter((s) => !live.has(s.id)).forEach((s) => playback.removeUnit(s));
    board.sounds.forEach((s) => playback.setLoop(s));

    this.host.scheduleSave();
    this.host.render();
  }

  /**
   * Renames the audio file or soundboard file behind a card. The rename goes through
   * Obsidian, which updates links and fires the vault event that keeps every board's paths current.
   */
  renameFile(s: Sound) {
    const { app } = this.host;
    const file = app.vault.getAbstractFileByPath(s.path);
    if (!(file instanceof TFile)) {
      new Notice(`Soundboard: "${s.path}" was not found in the vault.`);
      return;
    }

    const heading = s.kind === "board" ? "Rename soundboard" : "Rename audio file";
    new RenameModal(app, heading, file.basename, async (name) => {
      const invalid = validateFileName(name);
      if (invalid) return invalid;
      if (name === file.basename) return null;

      const target = normalizePath(`${file.parent?.path ?? ""}/${name}.${file.extension}`);
      if (app.vault.getAbstractFileByPath(target)) return `"${name}.${file.extension}" already exists here.`;

      await app.fileManager.renameFile(file, target);
      return null;
    }).open();
  }
}
