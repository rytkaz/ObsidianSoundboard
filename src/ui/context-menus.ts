/** Right-click menus for cards, scenes and empty space. */

import { Menu, TFile } from "obsidian";
import { hasClipboard } from "../clipboard";
import type { Point, Scene, Sound } from "../types";
import { plural } from "../utils";
import type { BoardHost } from "./host";

export class ContextMenus {
  constructor(private host: BoardHost) {}

  /** Menu for a card (audio file or nested soundboard). */
  forSound(e: MouseEvent, s: Sound) {
    this.claim(e);
    this.selectIfNeeded(s.id);
    const { playback, actions, app, selection } = this.host;
    const isBoard = s.kind === "board";
    const active = playback.unitActive(s);
    const menu = new Menu();

    menu.addItem((i) =>
      i
        .setTitle(active ? "Pause" : "Play")
        .setIcon(active ? "pause" : "play")
        .onClick(() => void playback.toggleSound(s))
    );
    if (isBoard) {
      menu.addItem((i) =>
        i
          .setTitle("Open soundboard")
          .setIcon("external-link")
          .onClick(() => {
            const f = app.vault.getAbstractFileByPath(s.path);
            if (f instanceof TFile) void app.workspace.getLeaf(true).openFile(f);
          })
      );
    }
    menu.addItem((i) =>
      i
        .setTitle(isBoard ? "Rename soundboard…" : "Rename audio file…")
        .setIcon("pencil")
        .onClick(() => actions.renameFile(s))
    );

    this.addCopyDelete(menu, selection.size);
    menu.showAtMouseEvent(e);
  }

  /** Menu for a scene frame. */
  forScene(e: MouseEvent, sc: Scene) {
    this.claim(e);
    this.selectIfNeeded(sc.id);
    const { playback, layer, selection } = this.host;
    const menu = new Menu();

    menu.addItem((i) =>
      i
        .setTitle("Play / pause scene")
        .setIcon("play")
        .onClick(() => playback.toggleScene(sc))
    );
    menu.addItem((i) =>
      i
        .setTitle("Rename scene…")
        .setIcon("pencil")
        .onClick(() => layer.startSceneRename(sc.id))
    );

    this.addCopyDelete(menu, selection.size);
    menu.showAtMouseEvent(e);
  }

  /** Menu for empty space: add things here, paste, select all. */
  forBackground(e: MouseEvent) {
    this.claim(e);
    const { camera, actions, board } = this.host;
    const at = camera.toWorld(e.clientX, e.clientY);
    const menu = new Menu();

    this.addItems(menu, at, true);
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Paste")
        .setIcon("clipboard-paste")
        .setDisabled(!hasClipboard())
        .onClick(() => actions.paste({ x: e.clientX, y: e.clientY }))
    );
    menu.addItem((i) =>
      i
        .setTitle("Select all")
        .setIcon("box-select")
        .setDisabled(board.sounds.length + board.scenes.length === 0)
        .onClick(() => actions.selectAll())
    );
    menu.showAtMouseEvent(e);
  }

  /**
   * The "add something" entries, shared by the toolbar and the background menu.
   * `at` is where new nodes land (the middle of the view when omitted).
   */
  addItems(menu: Menu, at?: Point, includeScene = true) {
    const { importer } = this.host;
    menu.addItem((i) =>
      i
        .setTitle("Import audio from computer")
        .setIcon("upload")
        .onClick(() => importer.pickFromComputer(at))
    );
    menu.addItem((i) =>
      i
        .setTitle("Import folder from computer")
        .setIcon("folder-up")
        .onClick(() => importer.pickFolderFromComputer(at))
    );
    menu.addItem((i) =>
      i
        .setTitle("Add audio from vault")
        .setIcon("file-audio")
        .onClick(() => importer.pickAudioFromVault(at))
    );
    menu.addItem((i) =>
      i
        .setTitle("Add folder from vault")
        .setIcon("folder-open")
        .onClick(() => importer.pickFolderFromVault(at))
    );
    menu.addItem((i) =>
      i
        .setTitle("Add soundboard from vault")
        .setIcon("layers")
        .onClick(() => importer.pickBoardFromVault(at))
    );
    if (includeScene) {
      menu.addItem((i) =>
        i
          .setTitle("Add scene")
          .setIcon("square-dashed")
          .onClick(() => importer.addScene(at))
      );
    }
  }

  /* ---------- helpers ---------- */

  private addCopyDelete(menu: Menu, selectedCount: number) {
    const { actions } = this.host;
    const suffix = selectedCount > 1 ? ` ${plural(selectedCount, "item")}` : "";
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle(`Copy${suffix}`)
        .setIcon("copy")
        .onClick(() => actions.copySelected())
    );
    menu.addItem((i) =>
      i
        .setTitle(`Delete${suffix}`)
        .setIcon("trash")
        .setWarning(true)
        .onClick(() => actions.deleteSelected())
    );
  }

  /** Right-clicking a node outside the selection selects just that node. */
  private selectIfNeeded(id: string) {
    if (!this.host.selection.has(id)) this.host.selection.set([id]);
  }

  /** Stops the browser menu and keeps the event from reaching the board background. */
  private claim(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
}
