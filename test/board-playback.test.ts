import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardPlayback, type PlaybackHost } from "../src/audio/board-playback";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { BoardData, Settings } from "../src/types";
import { makeBoard, makeScene, makeSound } from "./helpers/builders";
import { FakeAudio } from "./helpers/fake-audio";
import { App, Notice } from "./mocks/obsidian";

const FADE_TIMERS = ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] as const;

function setup(board: BoardData, settings: Partial<Settings> = {}, files: Record<string, string> = {}) {
  const app = new App();
  for (const path of ["rain.mp3", "wind.mp3", "owl.mp3", "frog.mp3"]) app.vault.addFile(path);
  for (const [path, text] of Object.entries(files)) app.vault.addFile(path, text);

  const config: Settings = { ...DEFAULT_SETTINGS, fadeMs: 0, soundFadeMs: 0, ...settings };
  const onChange = vi.fn();
  const host: PlaybackHost = {
    app: app as never,
    getWin: () => globalThis as unknown as Window,
    getSettings: () => config,
    getBoard: () => board,
    getFilePath: () => "Main.soundboard",
    onChange,
  };
  return { app, config, onChange, playback: new BoardPlayback(host) };
}

const audio = (path: string) => FakeAudio.forPath(path)!;
const playing = (path: string) => FakeAudio.instances.some((a) => a.dataset.path === path && !a.paused);
const boardText = (...sounds: object[]) => JSON.stringify({ sounds, scenes: [] });

describe("BoardPlayback", () => {
  describe("single cards", () => {
    it("plays and pauses a card", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain] }));

      await playback.toggleSound(rain);
      expect(playback.unitPlaying(rain)).toBe(true);
      expect(playback.unitActive(rain)).toBe(true);

      await playback.toggleSound(rain);
      expect(playback.unitPlaying(rain)).toBe(false);
    });

    it("plays with the card's loop flag and volume", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3", loop: false, volume: 0.3 });
      const { playback } = setup(makeBoard({ sounds: [rain] }));
      await playback.toggleSound(rain);
      expect(audio("rain.mp3").loop).toBe(false);
      expect(audio("rain.mp3").volume).toBeCloseTo(0.3);
    });

    it("multiplies by the volume of the scene the card sits in", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3", volume: 0.5, x: 10, y: 10 });
      const board = makeBoard({ sounds: [rain], scenes: [makeScene({ volume: 0.5 })] });
      const { playback } = setup(board);
      await playback.toggleSound(rain);
      expect(audio("rain.mp3").volume).toBeCloseTo(0.25);
    });

    it("applyUnitVolume picks up changes", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain] }));
      await playback.toggleSound(rain);
      rain.volume = 0.2;
      playback.applyUnitVolume(rain);
      expect(audio("rain.mp3").volume).toBeCloseTo(0.2);
    });

    it("setLoop updates a loaded sound", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain] }));
      await playback.toggleSound(rain);
      rain.loop = false;
      playback.setLoop(rain);
      expect(audio("rain.mp3").loop).toBe(false);
    });

    it("removeUnit stops and forgets the sound", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain] }));
      await playback.toggleSound(rain);
      playback.removeUnit(rain);
      expect(playback.unitPlaying(rain)).toBe(false);
      expect(audio("rain.mp3").paused).toBe(true);
    });

    it("stopAll stops every card", async () => {
      const a = makeSound({ id: "a", path: "rain.mp3" });
      const b = makeSound({ id: "b", path: "wind.mp3" });
      const { playback } = setup(makeBoard({ sounds: [a, b] }));
      await playback.toggleSound(a);
      await playback.toggleSound(b);
      playback.stopAll();
      expect(playback.unitPlaying(a) || playback.unitPlaying(b)).toBe(false);
    });
  });

  describe("scenes", () => {
    const build = () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3", x: 10, y: 10 });
      const wind = makeSound({ id: "wind", path: "wind.mp3", x: 20, y: 120 });
      const owl = makeSound({ id: "owl", path: "owl.mp3", x: 1000, y: 10 });
      const frog = makeSound({ id: "frog", path: "frog.mp3", x: 1010, y: 120 });
      const night = makeScene({ id: "night", x: 0, y: 0, w: 500, h: 300 });
      const forest = makeScene({ id: "forest", x: 990, y: 0, w: 500, h: 300 });
      return {
        rain,
        wind,
        owl,
        frog,
        night,
        forest,
        board: makeBoard({ sounds: [rain, wind, owl, frog], scenes: [night, forest] }),
      };
    };

    it("starts every card in a scene, and pauses them on the second press", async () => {
      const s = build();
      const { playback } = setup(s.board);
      await playback.toggleScene(s.night);
      expect(playing("rain.mp3") && playing("wind.mp3")).toBe(true);
      expect(playing("owl.mp3")).toBe(false);

      await playback.toggleScene(s.night);
      expect(playing("rain.mp3") || playing("wind.mp3")).toBe(false);
    });

    it("leaves other scenes alone when one-scene-at-a-time is off", async () => {
      const s = build();
      const { playback } = setup(s.board, { exclusive: false });
      await playback.toggleScene(s.night);
      await playback.toggleScene(s.forest);
      expect(playing("rain.mp3") && playing("owl.mp3")).toBe(true);
    });

    it("stops the other scenes when one-scene-at-a-time is on", async () => {
      const s = build();
      const { playback } = setup(s.board, { exclusive: true });
      await playback.toggleScene(s.night);
      await playback.toggleScene(s.forest);
      expect(playing("rain.mp3") || playing("wind.mp3")).toBe(false);
      expect(playing("owl.mp3") && playing("frog.mp3")).toBe(true);
    });

    it("treats a scene as playing when any of its cards is playing, even one shared with another scene", async () => {
      const s = build();
      s.forest.x = 0; // "forest" now overlaps "night", so they share the cards in the overlap
      s.forest.w = 1500;
      const { playback } = setup(s.board, { exclusive: true });
      await playback.toggleScene(s.night);
      expect(playing("rain.mp3")).toBe(true);

      // Pressing "forest" sees its shared card playing, so it pauses rather than starts.
      await playback.toggleScene(s.forest);
      expect(playing("rain.mp3")).toBe(false);
      expect(playing("owl.mp3")).toBe(false);
    });

    it("crossfades: the old scene fades out while the new one fades in", async () => {
      vi.useFakeTimers({ toFake: [...FADE_TIMERS] });
      try {
        const s = build();
        const { playback } = setup(s.board, { exclusive: true, fadeMs: 900 });
        await playback.toggleScene(s.night);
        vi.advanceTimersByTime(900);
        expect(audio("rain.mp3").volume).toBeCloseTo(1, 5);

        await playback.toggleScene(s.forest);
        // The old scene is on its way out and no longer counts as active.
        expect(playback.unitActive(s.rain)).toBe(false);
        expect(playback.unitPlaying(s.rain)).toBe(true);

        vi.advanceTimersByTime(450);
        expect(audio("rain.mp3").volume).toBeCloseTo(0.25, 5);
        expect(audio("owl.mp3").volume).toBeCloseTo(0.25, 5);

        vi.advanceTimersByTime(450);
        expect(playing("rain.mp3")).toBe(false);
        expect(audio("owl.mp3").volume).toBeCloseTo(1, 5);
      } finally {
        vi.useRealTimers();
      }
    });

    it("pressing a scene that is fading out brings it back instead of stopping it", async () => {
      vi.useFakeTimers({ toFake: [...FADE_TIMERS] });
      try {
        const s = build();
        const { playback } = setup(s.board, { fadeMs: 900 });
        await playback.toggleScene(s.night);
        vi.advanceTimersByTime(900);
        await playback.toggleScene(s.night); // start fading out
        vi.advanceTimersByTime(300);
        await playback.toggleScene(s.night); // changed my mind
        vi.advanceTimersByTime(900);
        expect(playing("rain.mp3")).toBe(true);
        expect(audio("rain.mp3").volume).toBeCloseTo(1, 5);
      } finally {
        vi.useRealTimers();
      }
    });

    it("uses the single-sound fade for cards, and the scene fade for scenes", async () => {
      vi.useFakeTimers({ toFake: [...FADE_TIMERS] });
      try {
        const s = build();
        const { playback } = setup(s.board, { fadeMs: 1500, soundFadeMs: 300 });
        await playback.toggleSound(s.owl);
        vi.advanceTimersByTime(300);
        expect(audio("owl.mp3").volume).toBeCloseTo(1, 5);

        await playback.toggleScene(s.night);
        vi.advanceTimersByTime(300);
        expect(audio("rain.mp3").volume).toBeLessThan(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("nested soundboards", () => {
    it("plays every sound on the nested board, mixing in the volumes", async () => {
      const child = boardText(
        { id: "c1", kind: "audio", path: "rain.mp3", x: 0, y: 0, volume: 0.5, loop: true },
        { id: "c2", kind: "audio", path: "wind.mp3", x: 900, y: 900, volume: 1, loop: false }
      );
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard", volume: 0.8 });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });

      await playback.toggleSound(card);

      expect(audio("rain.mp3").volume).toBeCloseTo(0.8 * 0.5);
      expect(audio("wind.mp3").volume).toBeCloseTo(0.8);
      expect(audio("wind.mp3").loop).toBe(false);
      expect(playback.unitActive(card)).toBe(true);
    });

    it("applies the nested board's own scene volumes", async () => {
      const child = JSON.stringify({
        sounds: [{ id: "c1", kind: "audio", path: "rain.mp3", x: 10, y: 10, volume: 1, loop: true }],
        scenes: [{ id: "s", name: "x", x: 0, y: 0, w: 500, h: 300, hue: 1, volume: 0.5 }],
      });
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard", volume: 1 });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });
      await playback.toggleSound(card);
      expect(audio("rain.mp3").volume).toBeCloseTo(0.5);
    });

    it("follows changes to the card's volume while playing", async () => {
      const child = boardText({ id: "c1", kind: "audio", path: "rain.mp3", x: 0, y: 0, volume: 1, loop: true });
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard", volume: 1 });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });
      await playback.toggleSound(card);
      card.volume = 0.25;
      playback.applyUnitVolume(card);
      expect(audio("rain.mp3").volume).toBeCloseTo(0.25);
    });

    it("pauses the whole nested board with the second press", async () => {
      const child = boardText(
        { id: "c1", kind: "audio", path: "rain.mp3", x: 0, y: 0, volume: 1, loop: true },
        { id: "c2", kind: "audio", path: "wind.mp3", x: 0, y: 0, volume: 1, loop: true }
      );
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });
      await playback.toggleSound(card);
      await playback.toggleSound(card);
      expect(playback.unitPlaying(card)).toBe(false);
    });

    it("flattens boards nested inside nested boards", async () => {
      const grandchild = boardText({ id: "g", kind: "audio", path: "owl.mp3", x: 0, y: 0, volume: 0.5, loop: true });
      const child = boardText({
        id: "inner",
        kind: "board",
        path: "Grand.soundboard",
        x: 0,
        y: 0,
        volume: 0.5,
        loop: true,
      });
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard", volume: 0.5 });
      const { playback } = setup(
        makeBoard({ sounds: [card] }),
        {},
        { "Child.soundboard": child, "Grand.soundboard": grandchild }
      );
      await playback.toggleSound(card);
      expect(audio("owl.mp3").volume).toBeCloseTo(0.5 * 0.5 * 0.5);
    });

    it("refuses a board that contains itself", async () => {
      const card = makeSound({ id: "node", kind: "board", path: "Main.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }));
      await playback.toggleSound(card);
      expect(FakeAudio.instances).toHaveLength(0);
      expect(Notice.messages.join(" ")).toMatch(/contains itself/);
    });

    it("refuses a cycle that goes through another board", async () => {
      const a = boardText({ id: "x", kind: "board", path: "B.soundboard", x: 0, y: 0, volume: 1, loop: true });
      const b = boardText(
        { id: "y", kind: "board", path: "A.soundboard", x: 0, y: 0, volume: 1, loop: true },
        { id: "z", kind: "audio", path: "rain.mp3", x: 0, y: 0, volume: 1, loop: true }
      );
      const card = makeSound({ id: "node", kind: "board", path: "A.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "A.soundboard": a, "B.soundboard": b });
      await playback.toggleSound(card);
      expect(Notice.messages.join(" ")).toMatch(/contains itself/);
      expect(playing("rain.mp3")).toBe(true); // the rest of the board still plays
    });

    it("warns when the nested board file is missing", async () => {
      const card = makeSound({ id: "node", kind: "board", path: "Gone.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }));
      await playback.toggleSound(card);
      expect(Notice.messages.join(" ")).toMatch(/Gone\.soundboard.*not found/);
    });

    it("treats a corrupt nested board as empty", async () => {
      const card = makeSound({ id: "node", kind: "board", path: "Bad.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Bad.soundboard": "{nope" });
      await playback.toggleSound(card);
      expect(FakeAudio.instances).toHaveLength(0);
    });

    it("removeUnit frees the nested board's audio", async () => {
      const child = boardText({ id: "c1", kind: "audio", path: "rain.mp3", x: 0, y: 0, volume: 1, loop: true });
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });
      await playback.toggleSound(card);
      playback.removeUnit(card);
      expect(playing("rain.mp3")).toBe(false);
      expect(playback.unitPlaying(card)).toBe(false);
    });

    it("re-reads the nested board from disk when it is started again", async () => {
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard" });
      const { app, playback } = setup(
        makeBoard({ sounds: [card] }),
        {},
        {
          "Child.soundboard": boardText({
            id: "c1",
            kind: "audio",
            path: "rain.mp3",
            x: 0,
            y: 0,
            volume: 1,
            loop: true,
          }),
        }
      );
      await playback.toggleSound(card);
      await playback.toggleSound(card);

      await app.vault.modify(
        app.vault.getAbstractFileByPath("Child.soundboard") as never,
        boardText({ id: "c9", kind: "audio", path: "owl.mp3", x: 0, y: 0, volume: 1, loop: true })
      );
      await playback.toggleSound(card);
      expect(playing("owl.mp3")).toBe(true);
      expect(playing("rain.mp3")).toBe(false);
    });
  });

  describe("renames", () => {
    it("applyRename updates card paths and reports whether anything changed", () => {
      const rain = makeSound({ path: "Old/rain.mp3" });
      const wind = makeSound({ path: "Other/wind.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain, wind] }));
      expect(playback.applyRename("New", "Old")).toBe(true);
      expect(rain.path).toBe("New/rain.mp3");
      expect(wind.path).toBe("Other/wind.mp3");
      expect(playback.applyRename("New", "Old")).toBe(false);
    });

    it("applyRename also updates a nested board card's path", () => {
      const card = makeSound({ kind: "board", path: "Boards/Child.soundboard" });
      const { playback } = setup(makeBoard({ sounds: [card] }));
      playback.applyRename("Scenes", "Boards");
      expect(card.path).toBe("Scenes/Child.soundboard");
    });

    it("repointAll moves playing audio to the renamed file without stopping it", async () => {
      const rain = makeSound({ id: "rain", path: "Old/rain.mp3" });
      const { app, playback } = setup(makeBoard({ sounds: [rain] }));
      app.vault.addFile("Old/rain.mp3");
      await playback.toggleSound(rain);

      await app.vault.rename(app.vault.getAbstractFileByPath("Old") as never, "New", "settled");
      playback.applyRename("New", "Old");
      playback.repointAll();
      await Promise.resolve();

      expect(FakeAudio.instances[0].src).toBe("app://local/New/rain.mp3");
      expect(FakeAudio.instances[0].playCalls).toBe(2);
    });

    it("repointAll also repoints sounds inside a nested board", async () => {
      const child = boardText({ id: "c1", kind: "audio", path: "Old/rain.mp3", x: 0, y: 0, volume: 1, loop: true });
      const card = makeSound({ id: "node", kind: "board", path: "Child.soundboard" });
      const { app, playback } = setup(makeBoard({ sounds: [card] }), {}, { "Child.soundboard": child });
      app.vault.addFile("Old/rain.mp3");
      await playback.toggleSound(card);

      await app.vault.rename(app.vault.getAbstractFileByPath("Old") as never, "New", "settled");
      playback.applyRename("New", "Old");
      playback.repointAll();
      await Promise.resolve();
      expect(FakeAudio.instances[0].src).toBe("app://local/New/rain.mp3");
    });
  });

  describe("reset", () => {
    it("stops everything and forgets nested boards", async () => {
      const rain = makeSound({ id: "rain", path: "rain.mp3" });
      const { playback } = setup(makeBoard({ sounds: [rain] }));
      await playback.toggleSound(rain);
      playback.reset();
      expect(playback.unitPlaying(rain)).toBe(false);
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useRealTimers();
});
