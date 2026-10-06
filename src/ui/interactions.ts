/** Pointer and keyboard handling: pan, box select, drag nodes, shortcuts, file drops. */

import { TFile, TFolder } from "obsidian";
import { nodesInRect, within } from "../board-model";
import { BOARD_EXT, Point, Scene, Sound } from "../types";
import { isAudio } from "../utils";
import { readDropped } from "./dropped-files";
import { dragPointer } from "./drag";
import type { BoardHost } from "./host";

/** Undocumented drag state Obsidian keeps while a file is dragged out of the file explorer. */
interface ObsidianDragManager {
  draggable?: { type?: string; file?: unknown; files?: unknown[] };
}

export class Interactions {
  /** Last pointer position over the board, in screen coordinates. */
  lastClient: Point | null = null;
  private spaceDown = false;

  constructor(private host: BoardHost) {}

  bind() {
    this.bindPointer();
    this.bindDrop();
    this.bindKeys();
    this.syncPanCursor();
  }

  /** Shows the grab cursor when a plain drag would pan. */
  syncPanCursor() {
    const panReady = this.host.plugin.settings.panByDefault || this.spaceDown;
    this.host.viewportEl.toggleClass("is-pan-ready", panReady);
  }

  /* ---------- empty space ---------- */

  private bindPointer() {
    const vp = this.host.viewportEl;

    vp.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as HTMLElement).closest(".sb-card, .sb-scene-head, .sb-resize, .sb-toolbar")) return;
      this.host.rootEl.focus({ preventScroll: true });

      const pan = e.button === 1 || this.spaceDown || e.shiftKey !== this.host.plugin.settings.panByDefault;
      if (pan) this.startPan(e);
      else this.startMarquee(e);
    });

    vp.addEventListener("pointermove", (e) => (this.lastClient = { x: e.clientX, y: e.clientY }));
    vp.addEventListener("pointerleave", () => (this.lastClient = null));

    vp.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest(".sb-toolbar")) return;
      this.host.menus.forBackground(e);
    });
  }

  private startPan(e: PointerEvent) {
    const { board, camera, viewportEl } = this.host;
    const v = board.view;
    const x0 = v.x;
    const y0 = v.y;
    viewportEl.addClass("is-panning");
    dragPointer(
      this.host,
      e,
      (dx, dy) => {
        v.x = x0 + dx * v.zoom;
        v.y = y0 + dy * v.zoom;
        camera.apply();
      },
      () => viewportEl.removeClass("is-panning")
    );
  }

  /** Drag a selection box. Ctrl/Cmd adds to the current selection. */
  private startMarquee(e: PointerEvent) {
    e.preventDefault();
    const { selection, board, camera, viewportEl, win } = this.host;
    const additive = e.ctrlKey || e.metaKey;
    const base = additive ? new Set(selection.snapshot()) : new Set<string>();
    if (!additive) selection.clear();

    const rect = viewportEl.getBoundingClientRect();
    const box = viewportEl.createDiv({ cls: "sb-marquee" });
    box.hide();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (!moved && Math.hypot(x - sx, y - sy) < 4) return;
      moved = true;

      const left = Math.min(x, sx);
      const top = Math.min(y, sy);
      const right = Math.max(x, sx);
      const bottom = Math.max(y, sy);
      box.show();
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${right - left}px`;
      box.style.height = `${bottom - top}px`;

      const a = camera.toWorld(rect.left + left, rect.top + top);
      const b = camera.toWorld(rect.left + right, rect.top + bottom);
      selection.set([...base, ...nodesInRect(board, a.x, a.y, b.x, b.y)]);
    };
    const up = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      box.remove();
    };
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
  }

  /* ---------- nodes ---------- */

  /** Press on a card or scene header: select it (Shift/Ctrl/Cmd toggles) and drag the whole selection. */
  nodePointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    const { selection } = this.host;
    this.host.rootEl.focus({ preventScroll: true });

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const wasSelected = selection.has(id);
    if (!additive && !wasSelected) selection.set([id]);
    else if (additive && !wasSelected) selection.add(id);

    const applyMove = this.beginMove();
    let moved = false;
    dragPointer(
      this.host,
      e,
      (dx, dy) => {
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        applyMove(dx, dy);
      },
      () => {
        if (moved) return this.host.refresh();
        // A click without dragging: toggle, or narrow a multi-selection to this node.
        if (additive && wasSelected) selection.remove(id);
        else if (!additive && wasSelected && selection.size > 1) selection.set([id]);
      }
    );
  }

  /** Records where everything that will move starts; returns a function that moves it by an offset. */
  private beginMove() {
    const { board, selection, layer } = this.host;
    const sounds = new Map<string, { s: Sound; x: number; y: number }>();
    const scenes: { sc: Scene; x: number; y: number }[] = [];

    for (const id of selection.snapshot()) {
      const s = board.sounds.find((n) => n.id === id);
      if (s) sounds.set(id, { s, x: s.x, y: s.y });

      const sc = board.scenes.find((n) => n.id === id);
      if (sc) {
        scenes.push({ sc, x: sc.x, y: sc.y });
        // Cards inside a moving scene travel with it.
        for (const m of board.sounds) {
          if (!sounds.has(m.id) && within(m, sc)) sounds.set(m.id, { s: m, x: m.x, y: m.y });
        }
      }
    }

    return (dx: number, dy: number) => {
      for (const o of scenes) {
        o.sc.x = o.x + dx;
        o.sc.y = o.y + dy;
        layer.placeNode(o.sc.id, o.sc.x, o.sc.y);
      }
      for (const o of sounds.values()) {
        o.s.x = o.x + dx;
        o.s.y = o.y + dy;
        layer.placeNode(o.s.id, o.s.x, o.s.y);
      }
    };
  }

  /* ---------- keyboard ---------- */

  private bindKeys() {
    const root = this.host.rootEl;
    const { actions, selection } = this.host;
    const isTyping = (el: HTMLElement) =>
      (el instanceof HTMLInputElement && el.type !== "range") || el instanceof HTMLTextAreaElement;

    root.addEventListener("keydown", (e) => {
      const el = e.target as HTMLElement;
      if (isTyping(el)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        actions.deleteSelected();
      } else if (mod && key === "c") {
        e.preventDefault();
        actions.copySelected();
      } else if (mod && key === "v") {
        e.preventDefault();
        actions.paste();
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        actions.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        actions.selectAll();
      } else if (e.key === "Escape") {
        selection.clear();
      } else if (e.key === " " && !el.closest("button")) {
        e.preventDefault();
        this.setSpace(true);
      }
    });
    root.addEventListener("keyup", (e) => {
      if (e.key === " ") this.setSpace(false);
    });
    root.addEventListener("focusout", () => this.setSpace(false));
  }

  private setSpace(down: boolean) {
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.syncPanCursor();
  }

  /* ---------- dropping files ---------- */

  private bindDrop() {
    const vp = this.host.viewportEl;
    vp.addEventListener("dragover", (e) => e.preventDefault());
    vp.addEventListener("drop", async (e) => {
      e.preventDefault();
      const at = this.host.camera.toWorld(e.clientX, e.clientY);

      // Files and folders dragged in from the operating system.
      const items = e.dataTransfer ? await readDropped(e.dataTransfer) : [];
      if (items.length) {
        await this.host.importer.importExternal(items, at);
        return;
      }

      // Best effort: files and folders dragged out of Obsidian's file explorer.
      const dm = (this.host.app as unknown as { dragManager?: ObsidianDragManager }).dragManager;
      const d = dm?.draggable;
      const dragged = d?.type === "file" ? [d.file] : d?.type === "files" ? d.files ?? [] : d?.type === "folder" ? [d.file] : [];

      const folders = dragged.filter((f): f is TFolder => f instanceof TFolder);
      folders.forEach((folder) => this.host.importer.addFolder(folder, at));

      const files = dragged.filter(
        (f): f is TFile =>
          f instanceof TFile &&
          (isAudio(f.extension) || (f.extension === BOARD_EXT && f.path !== this.host.filePath))
      );
      if (files.length) this.host.importer.addFiles(files, at);
    });
  }
}
