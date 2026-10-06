/** Builds the DOM for scenes and sound cards, and keeps it in sync with playback and selection. */

import { setIcon } from "obsidian";
import { cardSize, soundsIn } from "../board-model";
import { CARD_H, Scene, Sound } from "../types";
import { labelOf, place, plural } from "../utils";
import { dragPointer } from "./drag";
import type { BoardHost } from "./host";

interface CardEl {
  el: HTMLElement;
  play: HTMLButtonElement;
}

interface SceneEl {
  el: HTMLElement;
  play: HTMLButtonElement;
  count: HTMLElement;
  startRename: () => void;
}

const MIN_SCENE_W = 340;
const MIN_CARD_W = 170;
const MIN_CARD_H = 76;

/** Swaps a button's icon only when it actually changes (avoids flicker). */
function setIconOnce(btn: HTMLElement, icon: string) {
  if (btn.dataset.icon === icon) return;
  btn.dataset.icon = icon;
  setIcon(btn, icon);
}

export class NodeLayer {
  private cards = new Map<string, CardEl>();
  private scenes = new Map<string, SceneEl>();

  constructor(private host: BoardHost) {}

  /* ---------- building ---------- */

  render() {
    this.host.worldEl.empty();
    this.cards.clear();
    this.scenes.clear();
    // Scenes first, so cards always sit on top of them.
    this.host.board.scenes.forEach((sc) => this.renderScene(sc));
    this.host.board.sounds.forEach((s) => this.renderCard(s));
    this.refreshSelection();
  }

  private renderScene(sc: Scene) {
    const { host } = this;
    const el = host.worldEl.createDiv({ cls: "sb-scene" });
    el.style.setProperty("--hue", String(sc.hue));
    place(el, sc.x, sc.y, sc.w, sc.h);

    const head = el.createDiv({ cls: "sb-scene-head" });
    const play = head.createEl("button", { cls: "sb-scene-play", attr: { "aria-label": "Play or pause scene" } });
    const title = head.createSpan({ cls: "sb-scene-title", text: sc.name });
    const count = head.createSpan({ cls: "sb-scene-count" });

    const vol = head.createEl("input", { cls: "sb-scene-vol", type: "range" });
    vol.min = "0";
    vol.max = "1";
    vol.step = "0.01";
    vol.value = String(sc.volume ?? 1);
    vol.setAttr("aria-label", "Scene volume");
    vol.title = "Scene volume";

    const del = head.createEl("button", { cls: "sb-icon-btn", attr: { "aria-label": "Delete scene (keeps sounds)" } });
    setIcon(del, "x");
    const grip = el.createDiv({ cls: "sb-resize" });

    play.onclick = () => host.playback.toggleScene(sc);
    del.onclick = () => host.actions.deleteIds([sc.id]);
    vol.oninput = () => {
      sc.volume = Number(vol.value);
      soundsIn(host.board, sc).forEach((s) => host.playback.applyUnitVolume(s));
      host.scheduleSave(`scene-volume:${sc.id}`);
    };

    const startRename = () => {
      const input = head.createEl("input", { cls: "sb-rename", type: "text" });
      input.value = sc.name;
      title.replaceWith(input);
      input.focus();
      input.select();
      let cancelled = false;
      input.onkeydown = (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          cancelled = true;
          input.blur();
        }
      };
      input.onblur = () => {
        if (!cancelled) sc.name = input.value.trim() || sc.name;
        host.scheduleSave();
        host.render();
      };
    };
    title.ondblclick = startRename;

    head.addEventListener("pointerdown", (e) => host.interactions.nodePointerDown(e, sc.id));
    head.addEventListener("contextmenu", (e) => host.menus.forScene(e, sc));

    grip.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const w0 = sc.w;
      const h0 = sc.h;
      dragPointer(
        host,
        e,
        (dx, dy) => {
          sc.w = Math.max(MIN_SCENE_W, w0 + dx);
          sc.h = Math.max(CARD_H + 70, h0 + dy);
          place(el, sc.x, sc.y, sc.w, sc.h);
        },
        () => host.refresh()
      );
    });

    this.scenes.set(sc.id, { el, play, count, startRename });
  }

  private renderCard(s: Sound) {
    const { host } = this;
    const isBoard = s.kind === "board";
    const el = host.worldEl.createDiv({ cls: "sb-card" });
    el.toggleClass("is-board", isBoard);
    const size = cardSize(s);
    place(el, s.x, s.y, size.w, size.h);

    // Top row: play button, name, level meter, remove.
    const top = el.createDiv({ cls: "sb-card-top" });
    const play = top.createEl("button", { cls: "sb-play", attr: { "aria-label": "Play or pause" } });
    const name = top.createDiv({ cls: "sb-card-name", text: labelOf(s.path) });
    name.title = s.path;
    const bars = top.createDiv({ cls: "sb-bars" });
    for (let i = 0; i < 3; i++) bars.createSpan();
    const rm = top.createEl("button", { cls: "sb-icon-btn", attr: { "aria-label": "Remove from board" } });
    setIcon(rm, "x");

    // Bottom row: volume, and loop (audio) or a nested-board marker.
    const bottom = el.createDiv({ cls: "sb-card-bottom" });
    const vol = bottom.createEl("input", { cls: "sb-vol", type: "range" });
    vol.min = "0";
    vol.max = "1";
    vol.step = "0.01";
    vol.value = String(s.volume ?? 1);
    vol.setAttr("aria-label", "Volume");

    if (isBoard) {
      const tag = bottom.createSpan({ cls: "sb-board-tag", attr: { "aria-label": "Nested soundboard" } });
      tag.title = "Nested soundboard: plays every sound on it";
      setIcon(tag, "layers");
    } else {
      const loop = bottom.createEl("button", { cls: "sb-icon-btn sb-loop", attr: { "aria-label": "Loop" } });
      setIcon(loop, "repeat");
      loop.toggleClass("is-on", s.loop);
      loop.onclick = () => {
        s.loop = !s.loop;
        loop.toggleClass("is-on", s.loop);
        host.playback.setLoop(s);
        host.scheduleSave();
      };
    }

    const grip = el.createDiv({ cls: "sb-resize" });
    grip.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const { w: w0, h: h0 } = cardSize(s);
      dragPointer(
        host,
        e,
        (dx, dy) => {
          s.w = Math.round(Math.max(MIN_CARD_W, w0 + dx));
          s.h = Math.round(Math.max(MIN_CARD_H, h0 + dy));
          place(el, s.x, s.y, s.w, s.h);
        },
        () => host.refresh()
      );
    });

    play.onclick = () => void host.playback.toggleSound(s);
    vol.oninput = () => {
      s.volume = Number(vol.value);
      host.playback.applyUnitVolume(s);
      host.scheduleSave(`volume:${s.id}`);
    };
    rm.onclick = () => host.actions.deleteIds([s.id]);

    el.addEventListener("pointerdown", (e) => host.interactions.nodePointerDown(e, s.id));
    el.addEventListener("contextmenu", (e) => host.menus.forSound(e, s));

    this.cards.set(s.id, { el, play });
  }

  /* ---------- updating ---------- */

  /** Syncs icons, highlights and counts with what is currently playing. */
  refresh() {
    const { board, playback, app } = this.host;

    for (const s of board.sounds) {
      const c = this.cards.get(s.id);
      if (!c) continue;
      playback.applyUnitVolume(s);
      c.el.toggleClass("is-playing", playback.unitPlaying(s));
      c.el.toggleClass("is-missing", !app.vault.getAbstractFileByPath(s.path));
      setIconOnce(c.play, playback.unitActive(s) ? "pause" : "play");
    }

    for (const sc of board.scenes) {
      const c = this.scenes.get(sc.id);
      if (!c) continue;
      const members = soundsIn(board, sc);
      const active = members.filter((s) => playback.unitActive(s)).length;
      c.el.toggleClass("is-playing", active > 0);
      c.count.setText(
        members.length === 0
          ? "empty"
          : active > 0
            ? `${active} of ${members.length} playing`
            : plural(members.length, "sound")
      );
      setIconOnce(c.play, active > 0 ? "pause" : "play");
    }
  }

  refreshSelection() {
    const { selection } = this.host;
    this.cards.forEach((c, id) => c.el.toggleClass("is-selected", selection.has(id)));
    this.scenes.forEach((c, id) => c.el.toggleClass("is-selected", selection.has(id)));
  }

  /* ---------- helpers for other components ---------- */

  /** Moves a card or scene element without re-rendering. */
  placeNode(id: string, x: number, y: number) {
    const c = this.cards.get(id) ?? this.scenes.get(id);
    if (c) place(c.el, x, y);
  }

  startSceneRename(id: string) {
    this.scenes.get(id)?.startRename();
  }
}
