/**
 * Board-level playback. Turns cards and scenes into Playables, handles nested
 * soundboards, scene logic (one-at-a-time, crossfades) and volume mixing.
 */

import { App, Notice, TFile } from "obsidian";
import { parseBoard, sceneGainOf, soundsIn } from "../board-model";
import type { BoardData, Playable, Scene, Settings, Sound } from "../types";
import { labelOf, remapPath } from "../utils";
import { AudioEngine } from "./audio-engine";

export interface PlaybackHost {
  app: App;
  getWin(): Window;
  getSettings(): Settings;
  getBoard(): BoardData;
  getFilePath(): string | undefined;
  /** Something started, stopped or finished playing. */
  onChange(): void;
}

export class BoardPlayback {
  private engine: AudioEngine;
  /** Sounds found inside each nested-board card, keyed by card id. */
  private nested = new Map<string, Playable[]>();

  constructor(private host: PlaybackHost) {
    this.engine = new AudioEngine(host.app, () => host.getWin(), () => host.onChange());
  }

  /* ---------- state of a card ---------- */

  unitPlaying(s: Sound) {
    return this.targets(s).some((p) => this.engine.isPlaying(p));
  }

  /** Playing and not fading out. */
  unitActive(s: Sound) {
    return this.targets(s).some((p) => this.engine.isActive(p));
  }

  /* ---------- controls ---------- */

  /** Play or pause one card, with the single-sound fade. */
  async toggleSound(s: Sound) {
    const ms = this.host.getSettings().soundFadeMs;
    if (this.unitActive(s)) this.targets(s).forEach((p) => this.engine.fadeOut(p, ms));
    else await this.startUnit(s, ms);
  }

  /** Play or pause every card in a scene, with the scene fade. */
  toggleScene(sc: Scene) {
    const board = this.host.getBoard();
    const settings = this.host.getSettings();
    const members = soundsIn(board, sc);
    const ms = settings.fadeMs;

    if (members.some((s) => this.unitActive(s))) {
      members.forEach((s) => this.targets(s).forEach((p) => this.engine.fadeOut(p, ms)));
      return;
    }

    if (settings.exclusive) {
      const keep = new Set(members.map((s) => s.id));
      for (const other of board.scenes) {
        if (other.id === sc.id) continue;
        for (const s of soundsIn(board, other)) {
          if (!keep.has(s.id)) this.targets(s).forEach((p) => this.engine.fadeOut(p, ms));
        }
      }
    }
    members.forEach((s) => void this.startUnit(s, ms));
  }

  stopAll() {
    this.engine.stopAll();
  }

  /* ---------- settings of a card ---------- */

  applyUnitVolume(s: Sound) {
    this.targets(s).forEach((p) => this.engine.applyVolume(p));
  }

  setLoop(s: Sound) {
    this.engine.setLoop(s.id, s.loop);
  }

  /* ---------- lifecycle ---------- */

  /** Frees the audio of a card that is being removed. */
  removeUnit(s: Sound) {
    if (s.kind === "board") {
      (this.nested.get(s.id) ?? []).forEach((p) => this.engine.discard(p.id));
      this.nested.delete(s.id);
    } else {
      this.engine.discard(s.id);
    }
  }

  /** Stops and forgets everything. */
  reset() {
    this.nested.clear();
    this.engine.discardAll();
  }

  /**
   * Applies a file or folder rename to the board's cards and to already-loaded
   * nested sounds (paths only; see repointAll for the audio). Returns true when any card changed.
   */
  applyRename(newPath: string, oldPath: string) {
    let changed = false;
    for (const s of this.host.getBoard().sounds) {
      const np = remapPath(s.path, oldPath, newPath);
      if (np === s.path) continue;
      s.path = np;
      changed = true;
    }
    for (const leaves of this.nested.values()) {
      for (const leaf of leaves) {
        const np = remapPath(leaf.path, oldPath, newPath);
        if (np === leaf.path) continue;
        leaf.path = np;
      }
    }
    return changed;
  }

  /**
   * Re-points loaded audio at the files' new locations. Call this once a burst of
   * rename events has finished, when the vault can resolve the new paths.
   */
  repointAll() {
    for (const s of this.host.getBoard().sounds) {
      if (s.kind !== "board") this.engine.repointIfStale(s);
    }
    for (const leaves of this.nested.values()) {
      for (const leaf of leaves) this.engine.repointIfStale(leaf);
    }
  }

  /* ---------- turning cards into Playables ---------- */

  /** The sounds a card controls: itself, or everything inside a nested board (once loaded). */
  private targets(s: Sound): Playable[] {
    return s.kind === "board" ? this.nested.get(s.id) ?? [] : [this.playable(s)];
  }

  private playable(s: Sound): Playable {
    return { id: s.id, path: s.path, loop: s.loop, gain: () => (s.volume ?? 1) * this.sceneGain(s) };
  }

  private sceneGain(s: Sound) {
    return sceneGainOf(this.host.getBoard(), s);
  }

  private async startUnit(s: Sound, ms: number) {
    (await this.targetsFor(s)).forEach((p) => this.engine.fadeIn(p, ms));
  }

  /** Like targets(), but reads a nested board from disk first unless it is already playing. */
  private async targetsFor(s: Sound): Promise<Playable[]> {
    if (s.kind !== "board") return [this.playable(s)];

    const cached = this.nested.get(s.id);
    if (cached?.some((p) => this.engine.isPlaying(p))) return cached;

    const leaves = await this.flattenBoard(
      s.path,
      `${s.id}/`,
      () => (s.volume ?? 1) * this.sceneGain(s),
      [this.host.getFilePath() ?? ""]
    );
    const keep = new Set(leaves.map((l) => l.id));
    for (const old of cached ?? []) if (!keep.has(old.id)) this.engine.discard(old.id);
    this.nested.set(s.id, leaves);
    return leaves;
  }

  /** Flattens a board file, and any boards nested inside it, into playable sounds. */
  private async flattenBoard(path: string, prefix: string, outer: () => number, stack: string[]): Promise<Playable[]> {
    if (stack.includes(path)) {
      new Notice(`Soundboard: skipped "${labelOf(path)}" because it contains itself.`);
      return [];
    }
    const f = this.host.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      new Notice(`Soundboard: "${path}" was not found in the vault.`);
      return [];
    }

    const board = parseBoard(await this.host.app.vault.cachedRead(f));
    const out: Playable[] = [];
    for (const s of board.sounds) {
      const gain = () => outer() * (s.volume ?? 1) * sceneGainOf(board, s);
      if (s.kind === "board") {
        out.push(...(await this.flattenBoard(s.path, `${prefix}${s.id}/`, gain, [...stack, path])));
      } else {
        out.push({ id: prefix + s.id, path: s.path, loop: s.loop, gain });
      }
    }
    return out;
  }
}
