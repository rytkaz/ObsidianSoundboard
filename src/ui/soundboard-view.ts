/**
 * The soundboard view: owns the board data and wires the helpers together.
 * Each helper (camera, layer, interactions, ...) has one job; see ui/host.ts.
 */

import { Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import { BoardPlayback } from "../audio/board-playback";
import { allNodeIds, contentSnapshot, emptyBoard, parseBoard } from "../board-model";
import { History } from "../history";
import type SoundboardPlugin from "../main";
import { Selection } from "../selection";
import { BoardData, VIEW_TYPE } from "../types";
import { remapPath } from "../utils";
import { Camera } from "./camera";
import { ContextMenus } from "./context-menus";
import type { BoardHost } from "./host";
import { Importer } from "./importer";
import { Interactions } from "./interactions";
import { NodeActions } from "./node-actions";
import { NodeLayer } from "./node-layer";
import { Toolbar } from "./toolbar";

export class SoundboardView extends TextFileView implements BoardHost {
  board: BoardData = emptyBoard();

  viewportEl!: HTMLElement;
  worldEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private settleTimer = 0;
  private settlePending = false;

  readonly selection: Selection;
  readonly playback: BoardPlayback;
  readonly camera: Camera;
  readonly layer: NodeLayer;
  readonly interactions: Interactions;
  readonly menus: ContextMenus;
  readonly actions: NodeActions;
  readonly importer: Importer;
  readonly toolbar: Toolbar;
  readonly history = new History();

  constructor(leaf: WorkspaceLeaf, readonly plugin: SoundboardPlugin) {
    super(leaf);
    this.selection = new Selection(() => this.layer.refreshSelection());
    this.playback = new BoardPlayback({
      app: this.app,
      getWin: () => this.win,
      getSettings: () => this.plugin.settings,
      getBoard: () => this.board,
      getFilePath: () => this.filePath,
      onChange: () => this.refresh(),
    });
    this.camera = new Camera(this);
    this.layer = new NodeLayer(this);
    this.interactions = new Interactions(this);
    this.menus = new ContextMenus(this);
    this.actions = new NodeActions(this);
    this.importer = new Importer(this);
    this.toolbar = new Toolbar(this);
  }

  /* ---------- BoardHost ---------- */

  get win() {
    return this.contentEl.win;
  }

  get filePath() {
    return this.file?.path;
  }

  get rootEl() {
    return this.contentEl;
  }

  scheduleSave(coalesceKey?: string) {
    this.history.commit(contentSnapshot(this.board), coalesceKey);
    this.requestSave();
  }

  render() {
    if (!this.worldEl) return;
    this.layer.render();
    this.hintEl.toggleClass("is-hidden", this.board.sounds.length + this.board.scenes.length > 0);
    this.selection.prune(allNodeIds(this.board));
    this.camera.apply();
    this.layer.refresh();
  }

  refresh() {
    this.layer.refresh();
  }

  /* ---------- Obsidian view API ---------- */

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.basename ?? "Soundboard";
  }

  getIcon() {
    return "audio-lines";
  }

  getViewData() {
    return JSON.stringify(this.board, null, 2);
  }

  setViewData(raw: string, clear: boolean) {
    if (clear) {
      this.playback.reset();
      this.selection.clear();
    }
    this.board = parseBoard(raw, () =>
      new Notice("Soundboard: could not read this file, starting with an empty board.")
    );
    // A newly opened file starts a fresh history; later changes (e.g. from sync) become undoable.
    if (clear) this.history.reset(contentSnapshot(this.board));
    else this.history.commit(contentSnapshot(this.board));
    this.render();
  }

  clear() {
    this.playback.reset();
    this.board = emptyBoard();
    this.history.reset(contentSnapshot(this.board));
    this.render();
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("sb-root");
    root.tabIndex = -1;

    this.viewportEl = root.createDiv({ cls: "sb-viewport" });
    this.worldEl = this.viewportEl.createDiv({ cls: "sb-world" });
    this.hintEl = this.viewportEl.createDiv({
      cls: "sb-hint",
      text: "Drop audio files here, or right-click to add things.",
    });

    this.toolbar.build(this.viewportEl);
    this.camera.bindWheel();
    this.interactions.bind();
    this.render();
  }

  async onClose() {
    this.win.clearTimeout(this.settleTimer);
    this.playback.reset();
  }

  /* ---------- called by the plugin ---------- */

  /** A file or folder in the vault was renamed. A folder rename arrives as a burst of events. */
  handleRename(newPath: string, oldPath: string) {
    const changed = this.playback.applyRename(newPath, oldPath);
    if (changed) {
      // Keep undo history pointing at the new path too.
      this.history.remap((snapshot) => {
        const data = JSON.parse(snapshot);
        for (const s of data.sounds) s.path = remapPath(s.path, oldPath, newPath);
        return JSON.stringify(data);
      });
      this.requestSave();
    }
    if (changed || this.settlePending) this.scheduleRenameSettle();
  }

  /**
   * Waits for the burst of rename events to end, then refreshes the board. When a
   * folder is renamed, Obsidian may still be moving its children as the first event
   * arrives, so checking any earlier whether files exist would wrongly mark cards as missing.
   */
  private scheduleRenameSettle() {
    this.win.clearTimeout(this.settleTimer);
    this.settlePending = true;
    this.settleTimer = this.win.setTimeout(() => {
      this.settlePending = false;
      this.playback.repointAll();
      this.render();
    }, 200);
  }

  /** Settings changed. */
  syncToolbar() {
    this.toolbar.sync();
    this.interactions.syncPanCursor();
  }

  stopAll() {
    this.playback.stopAll();
  }

  undo() {
    this.actions.undo();
  }

  redo() {
    this.actions.redo();
  }
}
