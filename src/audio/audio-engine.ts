/**
 * Low-level playback: one HTMLAudioElement per Playable, plus volume fades.
 * It knows nothing about cards, scenes or nested boards.
 */

import { App, Notice, TFile } from "obsidian";
import type { Playable } from "../types";
import { clamp, labelOf } from "../utils";

interface Fade {
  /** Current fade level, 0 (silent) to 1 (full). */
  v: number;
  timer: number;
  /** 1 while fading in, 0 while fading out. */
  dir: 0 | 1;
}

export class AudioEngine {
  private audio = new Map<string, HTMLAudioElement>();
  private fades = new Map<string, Fade>();

  constructor(
    private app: App,
    private getWin: () => Window,
    /** Called whenever something starts, stops or finishes. */
    private onChange: () => void
  ) {}

  /* ---------- state ---------- */

  isPlaying(p: { id: string }) {
    const a = this.audio.get(p.id);
    return !!a && !a.paused;
  }

  /** Playing and not on its way out. */
  isActive(p: { id: string }) {
    return this.isPlaying(p) && this.fades.get(p.id)?.dir !== 0;
  }

  /* ---------- transport ---------- */

  play(p: Playable) {
    this.cancelFade(p.id);
    this.start(p);
  }

  pause(p: Playable) {
    this.cancelFade(p.id);
    this.audio.get(p.id)?.pause();
    this.applyVolume(p);
  }

  fadeIn(p: Playable, ms: number) {
    if (ms <= 0) return this.play(p);
    const a = this.load(p);
    if (!a) return;
    if (a.paused) {
      this.cancelFade(p.id);
      this.fades.set(p.id, { v: 0, timer: 0, dir: 1 });
      this.applyVolume(p);
      this.start(p);
    }
    this.animate(p, 1, ms);
  }

  fadeOut(p: Playable, ms: number) {
    if (!this.isPlaying(p)) return;
    if (ms <= 0) return this.pause(p);
    this.animate(p, 0, ms, () => this.pause(p));
  }

  /** Stops everything immediately and rewinds. */
  stopAll() {
    const win = this.getWin();
    this.fades.forEach((f) => win.clearInterval(f.timer));
    this.fades.clear();
    this.audio.forEach((a) => {
      a.pause();
      a.currentTime = 0;
    });
    this.onChange();
  }

  /* ---------- settings of a loaded sound ---------- */

  applyVolume(p: Playable) {
    const a = this.audio.get(p.id);
    if (!a) return;
    const level = this.fades.get(p.id)?.v ?? 1;
    // Squaring the fade level sounds smoother than a linear ramp.
    a.volume = clamp(p.gain() * level * level, 0, 1);
  }

  setLoop(id: string, loop: boolean) {
    const a = this.audio.get(id);
    if (a) a.loop = loop;
  }

  /** Like repoint(), but only when the element still points at an outdated path. */
  repointIfStale(p: { id: string; path: string }) {
    const a = this.audio.get(p.id);
    if (a && a.dataset.path !== p.path) this.repoint(p);
  }

  /** Points an already-loaded element at the file's new location, keeping position and playback. */
  repoint(p: { id: string; path: string }) {
    const a = this.audio.get(p.id);
    const f = this.app.vault.getAbstractFileByPath(p.path);
    if (!a || !(f instanceof TFile)) return;
    const position = a.currentTime;
    const wasPlaying = !a.paused;
    a.dataset.path = p.path;
    a.src = this.app.vault.getResourcePath(f);
    a.addEventListener(
      "loadedmetadata",
      () => {
        a.currentTime = position;
        if (wasPlaying) a.play().catch(() => {});
      },
      { once: true }
    );
  }

  /* ---------- cleanup ---------- */

  discard(id: string) {
    const a = this.audio.get(id);
    if (!a) return;
    this.cancelFade(id);
    a.pause();
    a.removeAttribute("src");
    a.load();
    this.audio.delete(id);
  }

  discardAll() {
    [...this.audio.keys()].forEach((id) => this.discard(id));
  }

  /* ---------- internals ---------- */

  /** Returns the audio element for a playable, creating it on first use. */
  private load(p: Playable): HTMLAudioElement | null {
    let a = this.audio.get(p.id);
    if (a && a.dataset.path !== p.path) {
      this.discard(p.id);
      a = undefined;
    }
    if (!a) {
      const f = this.app.vault.getAbstractFileByPath(p.path);
      if (!(f instanceof TFile)) {
        new Notice(`Soundboard: "${p.path}" was not found in the vault.`);
        return null;
      }
      a = new Audio(this.app.vault.getResourcePath(f));
      a.dataset.path = p.path;
      a.preload = "auto";
      for (const ev of ["play", "pause", "ended"]) a.addEventListener(ev, () => this.onChange());
      this.audio.set(p.id, a);
    }
    a.loop = p.loop;
    this.applyVolume(p);
    return a;
  }

  private start(p: Playable) {
    this.load(p)
      ?.play()
      .catch((err) => new Notice(`Soundboard: cannot play "${labelOf(p.path)}" (${err?.message ?? err})`));
  }

  private cancelFade(id: string) {
    const f = this.fades.get(id);
    if (!f) return;
    this.getWin().clearInterval(f.timer);
    this.fades.delete(id);
  }

  private animate(p: Playable, target: 0 | 1, ms: number, done?: () => void) {
    const win = this.getWin();
    const fade = this.fades.get(p.id) ?? { v: 1, timer: 0, dir: 1 as 0 | 1 };
    win.clearInterval(fade.timer);
    fade.dir = target;
    this.fades.set(p.id, fade);

    const from = fade.v;
    const t0 = performance.now();
    const step = () => {
      const k = clamp((performance.now() - t0) / ms, 0, 1);
      fade.v = from + (target - from) * k;
      this.applyVolume(p);
      if (k >= 1) {
        win.clearInterval(fade.timer);
        if (target === 1) this.fades.delete(p.id);
        done?.();
      }
    };
    fade.timer = win.setInterval(step, 30);
  }
}
