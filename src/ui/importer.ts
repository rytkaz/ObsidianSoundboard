/** Adding things to the board: audio, folders of audio, nested soundboards, scenes. */

import { Notice, TFile, TFolder, Vault, normalizePath } from "obsidian";
import { blockSize, layoutNewCards } from "../layout";
import { BOARD_EXT, CARD_H, CARD_W, IMPORT_FOLDER, Point } from "../types";
import { isAudio, plural, uid } from "../utils";
import { ImportItem, fromFileList } from "./dropped-files";
import type { BoardHost } from "./host";
import { FilePicker, FolderPicker } from "./modals";

const SCENE_W = 3 * CARD_W + 80;
const SCENE_H = 2 * CARD_H + 110;

const byPath = (a: TFile, b: TFile) => a.path.localeCompare(b.path, undefined, { numeric: true });

export class Importer {
  constructor(private host: BoardHost) {}

  /* ---------- choosing what to add ---------- */

  /** System file picker; the chosen audio is copied into the vault. */
  pickFromComputer(at?: Point) {
    const input = createEl("input", { type: "file" });
    input.multiple = true;
    input.accept = "audio/*";
    input.onchange = () => {
      const items = fromFileList(input.files);
      if (items.length) void this.importExternal(items, at);
    };
    input.click();
  }

  /** System folder picker; every audio file inside (subfolders included) is copied into the vault. */
  pickFolderFromComputer(at?: Point) {
    const input = createEl("input", { type: "file" });
    input.webkitdirectory = true;
    input.onchange = () => {
      const items = fromFileList(input.files);
      if (items.length) void this.importExternal(items, at);
      else new Notice("Soundboard: no audio files found in that folder.");
    };
    input.click();
  }

  pickAudioFromVault(at?: Point) {
    new FilePicker(
      this.host.app,
      "Search audio files in your vault",
      (f) => isAudio(f.extension),
      (f) => this.addFiles([f], at)
    ).open();
  }

  /** Lists vault folders that contain audio somewhere inside them. */
  pickFolderFromVault(at?: Point) {
    const folders = new Set<TFolder>();
    for (const f of this.host.app.vault.getFiles()) {
      if (!isAudio(f.extension)) continue;
      for (let p = f.parent; p && !p.isRoot(); p = p.parent) folders.add(p);
    }
    if (!folders.size) {
      new Notice("Soundboard: no folders with audio files found in the vault.");
      return;
    }
    const sorted = [...folders].sort((a, b) => a.path.localeCompare(b.path));
    new FolderPicker(this.host.app, sorted, (folder) => this.addFolder(folder, at)).open();
  }

  pickBoardFromVault(at?: Point) {
    new FilePicker(
      this.host.app,
      "Search soundboards in your vault",
      (f) => f.extension === BOARD_EXT && f.path !== this.host.filePath,
      (f) => this.addFiles([f], at)
    ).open();
  }

  /* ---------- adding ---------- */

  /** Adds a card for every audio file in a vault folder, subfolders included. */
  addFolder(folder: TFolder, at?: Point) {
    const files: TFile[] = [];
    Vault.recurseChildren(folder, (f) => {
      if (f instanceof TFile && isAudio(f.extension)) files.push(f);
    });
    if (!files.length) {
      new Notice(`Soundboard: "${folder.name}" has no audio files.`);
      return;
    }
    this.addFiles(files, at);
    new Notice(`Added ${plural(files.length, "sound")} from ${folder.name}`);
  }

  /** Copies files from outside the vault into the Soundboard folder (keeping folder structure), then adds them. */
  async importExternal(items: ImportItem[], at?: Point) {
    if (!items.length) return;
    const saved: TFile[] = [];
    for (const { file, relPath } of items) {
      const path = this.freePath(relPath);
      await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
      saved.push(await this.host.app.vault.createBinary(path, await file.arrayBuffer()));
    }
    this.addFiles(saved, at);
    new Notice(`Imported ${plural(saved.length, "sound")} into ${IMPORT_FOLDER}/`);
  }

  /**
   * Adds vault files as cards. They are sorted by path and laid out in a grid
   * starting at `at` (or centred in view), skipping spots taken by existing cards.
   * `.soundboard` files become nested boards. The new cards end up selected.
   */
  addFiles(files: TFile[], at?: Point) {
    if (!files.length) return;
    const { board, selection } = this.host;
    const sorted = [...files].sort(byPath);

    const size = blockSize(sorted.length);
    const origin = at ?? this.centredOrigin(size.w, size.h);
    const spots = layoutNewCards(board, sorted.length, origin);

    const ids: string[] = [];
    sorted.forEach((f, i) => {
      const isBoard = f.extension === BOARD_EXT;
      const id = uid();
      ids.push(id);
      board.sounds.push({
        id,
        kind: isBoard ? "board" : "audio",
        path: f.path,
        x: spots[i].x,
        y: spots[i].y,
        volume: isBoard ? 1 : 0.8,
        loop: true,
      });
    });
    this.host.scheduleSave();
    this.host.render();
    selection.set(ids);
  }

  addScene(at?: Point) {
    const origin = at ?? this.centredOrigin(SCENE_W, SCENE_H);
    const n = this.host.board.scenes.length + 1;
    this.host.board.scenes.push({
      id: uid(),
      name: `Scene ${n}`,
      x: Math.round(origin.x),
      y: Math.round(origin.y),
      w: SCENE_W,
      h: SCENE_H,
      hue: (n * 67) % 360,
      volume: 1,
    });
    this.host.scheduleSave();
    this.host.render();
  }

  /* ---------- helpers ---------- */

  /** A vault path under the Soundboard folder that does not exist yet ("rain.mp3", "rain 1.mp3", ...). */
  private freePath(relPath: string) {
    const full = normalizePath(`${IMPORT_FOLDER}/${relPath}`);
    const dot = full.lastIndexOf(".");
    const stem = full.slice(0, dot);
    const ext = full.slice(dot);
    let path = full;
    for (let n = 1; this.host.app.vault.getAbstractFileByPath(path); n++) path = `${stem} ${n}${ext}`;
    return path;
  }

  /** Creates a folder and any missing parents. */
  private async ensureFolder(dir: string) {
    const { vault } = this.host.app;
    let current = "";
    for (const part of dir.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (vault.getAbstractFileByPath(current)) continue;
      try {
        await vault.createFolder(current);
      } catch {
        /* created in the meantime */
      }
    }
  }

  /** Top-left corner that centres an item of the given size in the visible area. */
  private centredOrigin(w: number, h: number): Point {
    const c = this.host.camera.centerWorld();
    return { x: c.x - w / 2, y: c.y - h / 2 };
  }
}
