/**
 * What the UI helpers need from the board view. SoundboardView implements this,
 * and every helper receives it instead of reaching into the view directly.
 */

import type { App } from "obsidian";
import type { BoardPlayback } from "../audio/board-playback";
import type { History } from "../history";
import type SoundboardPlugin from "../main";
import type { Selection } from "../selection";
import type { BoardData } from "../types";
import type { Camera } from "./camera";
import type { ContextMenus } from "./context-menus";
import type { Importer } from "./importer";
import type { Interactions } from "./interactions";
import type { NodeActions } from "./node-actions";
import type { NodeLayer } from "./node-layer";
import type { Toolbar } from "./toolbar";

export interface BoardHost {
  readonly app: App;
  readonly plugin: SoundboardPlugin;
  readonly win: Window;
  /** Path of the `.soundboard` file this view shows. */
  readonly filePath: string | undefined;

  board: BoardData;

  /** DOM */
  readonly rootEl: HTMLElement;
  readonly viewportEl: HTMLElement;
  readonly worldEl: HTMLElement;

  /** Helpers */
  readonly selection: Selection;
  readonly playback: BoardPlayback;
  readonly camera: Camera;
  readonly layer: NodeLayer;
  readonly interactions: Interactions;
  readonly menus: ContextMenus;
  readonly actions: NodeActions;
  readonly importer: Importer;
  readonly toolbar: Toolbar;
  readonly history: History;

  /** Rebuilds all nodes from the board data. */
  render(): void;
  /** Updates icons, highlights and counts to match what is playing. */
  refresh(): void;
  /**
   * Records the change for undo and schedules the board file to be saved.
   * Calls with the same `coalesceKey` in quick succession become one undo step.
   */
  scheduleSave(coalesceKey?: string): void;
}
