import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../src/audio/audio-engine";
import type { Playable } from "../src/types";
import { FakeAudio } from "./helpers/fake-audio";
import { App, Notice } from "./mocks/obsidian";

const FADE_TIMERS = ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] as const;

function setup() {
  const app = new App();
  app.vault.addFile("rain.mp3");
  app.vault.addFile("wind.mp3");
  const onChange = vi.fn();
  const engine = new AudioEngine(app as never, () => globalThis as unknown as Window, onChange);
  const sound = (path: string, gain = 1, loop = true): Playable => ({ id: path, path, loop, gain: () => gain });
  return { app, engine, onChange, sound };
}

describe("AudioEngine", () => {
  describe("transport", () => {
    it("creates an element on first play and starts it", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      const audio = FakeAudio.forPath("rain.mp3")!;
      expect(audio.src).toBe("app://local/rain.mp3");
      expect(audio.paused).toBe(false);
      expect(engine.isPlaying(rain)).toBe(true);
    });

    it("applies loop and volume", () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3", 0.4, false));
      const audio = FakeAudio.forPath("rain.mp3")!;
      expect(audio.loop).toBe(false);
      expect(audio.volume).toBeCloseTo(0.4);
    });

    it("pauses and keeps the element for later", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      engine.pause(rain);
      expect(engine.isPlaying(rain)).toBe(false);
      engine.play(rain);
      expect(FakeAudio.instances).toHaveLength(1);
    });

    it("tells the listener when playback state changes", () => {
      const { engine, sound, onChange } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      engine.pause(rain);
      expect(onChange).toHaveBeenCalled();
    });

    it("warns instead of crashing when the file is missing", () => {
      const { engine, sound } = setup();
      engine.play(sound("ghost.mp3"));
      expect(FakeAudio.instances).toHaveLength(0);
      expect(Notice.messages[0]).toMatch(/ghost\.mp3.*not found/);
    });

    it("reports a failure to start playback", async () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      const audio = FakeAudio.forPath("rain.mp3")!;
      audio.pause();
      audio.play = () => Promise.reject(new Error("blocked"));
      engine.play(sound("rain.mp3"));
      await Promise.resolve();
      await Promise.resolve();
      expect(Notice.messages.some((m) => /cannot play.*blocked/.test(m))).toBe(true);
    });

    it("stopAll pauses everything and rewinds", () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      engine.play(sound("wind.mp3"));
      FakeAudio.instances.forEach((a) => (a.currentTime = 12));
      engine.stopAll();
      for (const a of FakeAudio.instances) {
        expect(a.paused).toBe(true);
        expect(a.currentTime).toBe(0);
      }
    });
  });

  describe("settings of a loaded sound", () => {
    it("applyVolume follows the gain function", () => {
      const { engine } = setup();
      let gain = 1;
      const rain: Playable = { id: "r", path: "rain.mp3", loop: true, gain: () => gain };
      engine.play(rain);
      gain = 0.25;
      engine.applyVolume(rain);
      expect(FakeAudio.instances[0].volume).toBeCloseTo(0.25);
    });

    it("clamps volume into 0..1", () => {
      const { engine } = setup();
      const loud: Playable = { id: "r", path: "rain.mp3", loop: true, gain: () => 3 };
      engine.play(loud);
      expect(FakeAudio.instances[0].volume).toBe(1);
    });

    it("setLoop updates a loaded element and ignores unknown ids", () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      engine.setLoop("rain.mp3", false);
      engine.setLoop("nobody", false);
      expect(FakeAudio.instances[0].loop).toBe(false);
    });
  });

  describe("fades", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: [...FADE_TIMERS] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fadeIn starts silent and ramps up to full volume", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3", 1);
      engine.fadeIn(rain, 900);
      const audio = FakeAudio.instances[0];
      expect(audio.paused).toBe(false);
      expect(audio.volume).toBe(0);

      vi.advanceTimersByTime(450);
      expect(audio.volume).toBeCloseTo(0.25, 5); // half way, squared

      vi.advanceTimersByTime(450);
      expect(audio.volume).toBeCloseTo(1, 5);
    });

    it("fadeOut ramps down, then pauses and restores the volume", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3", 0.8);
      engine.play(rain);
      engine.fadeOut(rain, 900);
      const audio = FakeAudio.instances[0];

      vi.advanceTimersByTime(450);
      expect(audio.paused).toBe(false);
      expect(audio.volume).toBeCloseTo(0.8 * 0.25, 5);

      vi.advanceTimersByTime(450);
      expect(audio.paused).toBe(true);
      expect(audio.volume).toBeCloseTo(0.8, 5);
    });

    it("a sound that is fading out is playing but not active", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      expect(engine.isActive(rain)).toBe(true);
      engine.fadeOut(rain, 900);
      expect(engine.isPlaying(rain)).toBe(true);
      expect(engine.isActive(rain)).toBe(false);
    });

    it("fading back in from a half-faded-out sound starts from where it was", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      engine.fadeOut(rain, 900);
      vi.advanceTimersByTime(450);
      engine.fadeIn(rain, 900);
      const audio = FakeAudio.instances[0];
      expect(audio.volume).toBeCloseTo(0.25, 1);
      vi.advanceTimersByTime(900);
      expect(audio.volume).toBeCloseTo(1, 5);
      expect(audio.paused).toBe(false);
      expect(engine.isActive(rain)).toBe(true);
    });

    it("a zero-length fade is immediate", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.fadeIn(rain, 0);
      expect(engine.isPlaying(rain)).toBe(true);
      engine.fadeOut(rain, 0);
      expect(engine.isPlaying(rain)).toBe(false);
    });

    it("fadeOut does nothing for a sound that is not playing", () => {
      const { engine, sound } = setup();
      engine.fadeOut(sound("rain.mp3"), 900);
      expect(FakeAudio.instances).toHaveLength(0);
    });

    it("pausing during a fade cancels it and restores full volume", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3", 0.6);
      engine.play(rain);
      engine.fadeOut(rain, 900);
      vi.advanceTimersByTime(300);
      engine.pause(rain);
      const audio = FakeAudio.instances[0];
      expect(audio.paused).toBe(true);
      expect(audio.volume).toBeCloseTo(0.6, 5);
      vi.advanceTimersByTime(2000); // nothing left running
      expect(audio.volume).toBeCloseTo(0.6, 5);
    });

    it("stopAll cancels running fades", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.fadeIn(rain, 900);
      engine.stopAll();
      vi.advanceTimersByTime(2000);
      expect(FakeAudio.instances[0].paused).toBe(true);
    });
  });

  describe("renames", () => {
    it("repoint switches the source and resumes a playing sound at the same position", async () => {
      const { app, engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      const audio = FakeAudio.instances[0];
      audio.currentTime = 42;

      app.vault.addFile("storm.mp3");
      engine.repoint({ id: "rain.mp3", path: "storm.mp3" });
      expect(audio.src).toBe("app://local/storm.mp3");
      await Promise.resolve();
      expect(audio.currentTime).toBe(42);
      expect(audio.playCalls).toBe(2);
    });

    it("repoint leaves a paused sound paused", async () => {
      const { app, engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      engine.pause(rain);
      app.vault.addFile("storm.mp3");
      engine.repoint({ id: "rain.mp3", path: "storm.mp3" });
      await Promise.resolve();
      expect(FakeAudio.instances[0].playCalls).toBe(1);
    });

    it("repoint does nothing when the new file cannot be found yet", () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      engine.repoint({ id: "rain.mp3", path: "nowhere.mp3" });
      expect(FakeAudio.instances[0].src).toBe("app://local/rain.mp3");
    });

    it("repointIfStale only acts when the stored path differs", () => {
      const { app, engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      app.vault.addFile("storm.mp3");
      engine.repointIfStale({ id: "rain.mp3", path: "rain.mp3" });
      expect(FakeAudio.instances[0].src).toBe("app://local/rain.mp3");
      engine.repointIfStale({ id: "rain.mp3", path: "storm.mp3" });
      expect(FakeAudio.instances[0].src).toBe("app://local/storm.mp3");
    });

    it("replaces the element when a playable's path changed behind the engine's back", () => {
      const { app, engine } = setup();
      app.vault.addFile("storm.mp3");
      engine.play({ id: "x", path: "rain.mp3", loop: true, gain: () => 1 });
      engine.play({ id: "x", path: "storm.mp3", loop: true, gain: () => 1 });
      expect(FakeAudio.instances).toHaveLength(2);
      expect(FakeAudio.instances[0].paused).toBe(true);
      expect(FakeAudio.instances[1].src).toBe("app://local/storm.mp3");
    });
  });

  describe("cleanup", () => {
    it("discard stops and forgets one sound", () => {
      const { engine, sound } = setup();
      const rain = sound("rain.mp3");
      engine.play(rain);
      engine.discard("rain.mp3");
      expect(FakeAudio.instances[0].paused).toBe(true);
      expect(FakeAudio.instances[0].src).toBe("");
      expect(engine.isPlaying(rain)).toBe(false);
    });

    it("discard ignores unknown ids", () => {
      const { engine } = setup();
      expect(() => engine.discard("nobody")).not.toThrow();
    });

    it("discardAll empties the engine", () => {
      const { engine, sound } = setup();
      engine.play(sound("rain.mp3"));
      engine.play(sound("wind.mp3"));
      engine.discardAll();
      expect(FakeAudio.instances.every((a) => a.paused)).toBe(true);
    });
  });
});
