/** Shared constants and data shapes. Nothing in here depends on Obsidian. */

export const VIEW_TYPE = "soundboard-view";
export const BOARD_EXT = "soundboard";
export const IMPORT_FOLDER = "Soundboard";
export const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "flac", "webm", "aac", "opus"];

/** Size of a sound card in board units. */
export const CARD_W = 280;
export const CARD_H = 76;

export interface Point {
  x: number;
  y: number;
}

/** A card on the board: either one audio file or a nested soundboard. */
export interface Sound {
  id: string;
  kind?: "audio" | "board";
  /** Vault path of the audio file or `.soundboard` file. */
  path: string;
  x: number;
  y: number;
  volume: number;
  loop: boolean;
  /** Size in board units; the CARD_W x CARD_H default applies when missing. */
  w?: number;
  h?: number;
}

/** A frame that groups the cards sitting inside it. */
export interface Scene {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number;
  volume?: number;
}

/** The contents of a `.soundboard` file. */
export interface BoardData {
  view: { x: number; y: number; zoom: number };
  sounds: Sound[];
  scenes: Scene[];
}

export interface Settings {
  exclusive: boolean;
  fadeMs: number;
  soundFadeMs: number;
  panByDefault: boolean;
}

/** One concrete audio file the engine can play (a card, or a sound inside a nested board). */
export interface Playable {
  id: string;
  path: string;
  loop: boolean;
  /** Combined volume of the card and every scene/board it sits in, from 0 to 1. */
  gain: () => number;
}

export interface Clip {
  sounds: Sound[];
  scenes: Scene[];
}
