import { AUDIO_EXTS } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const extOf = (name: string) => name.split(".").pop() ?? "";

export const isAudio = (ext: string) => AUDIO_EXTS.includes(ext.toLowerCase());

/** "Sounds/rain.mp3" becomes "rain". */
export const labelOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Re-points a path after a file or folder rename (handles files inside renamed folders). */
export function remapPath(path: string, oldPath: string, newPath: string) {
  if (path === oldPath) return newPath;
  if (path.startsWith(oldPath + "/")) return newPath + path.slice(oldPath.length);
  return path;
}

/** Returns an error message, or null when the name is acceptable. */
export function validateFileName(name: string): string | null {
  if (!name) return "Enter a name.";
  if (/[\\/:*?"<>|]/.test(name)) return 'A name cannot contain any of: \\ / : * ? " < > |';
  if (name.startsWith(".")) return "A name cannot start with a dot.";
  return null;
}

/** Positions an absolutely placed element in board units. */
export function place(el: HTMLElement, x: number, y: number, w?: number, h?: number) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (w !== undefined) el.style.width = `${w}px`;
  if (h !== undefined) el.style.height = `${h}px`;
}
