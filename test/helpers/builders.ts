import type { BoardData, Scene, Sound } from "../../src/types";

let counter = 0;
const nextId = () => `n${++counter}`;

export function makeSound(overrides: Partial<Sound> = {}): Sound {
  return { id: nextId(), kind: "audio", path: "a.mp3", x: 0, y: 0, volume: 1, loop: true, ...overrides };
}

export function makeScene(overrides: Partial<Scene> = {}): Scene {
  return { id: nextId(), name: "Scene", x: 0, y: 0, w: 400, h: 300, hue: 100, volume: 1, ...overrides };
}

export function makeBoard(overrides: Partial<BoardData> = {}): BoardData {
  return { view: { x: 0, y: 0, zoom: 1 }, sounds: [], scenes: [], ...overrides };
}
