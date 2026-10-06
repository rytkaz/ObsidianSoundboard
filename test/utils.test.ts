import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clamp, extOf, isAudio, labelOf, place, plural, remapPath, uid, validateFileName } from "../src/utils";

describe("uid", () => {
  it("returns distinct non-empty ids", () => {
    const ids = new Set(Array.from({ length: 500 }, uid));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).not.toBe("");
  });
});

describe("clamp", () => {
  it.each([
    [5, 0, 10, 5],
    [-1, 0, 10, 0],
    [11, 0, 10, 10],
  ])("clamp(%d, %d, %d) = %d", (n, lo, hi, expected) => {
    expect(clamp(n, lo, hi)).toBe(expected);
  });
});

describe("file name helpers", () => {
  it("extOf returns the last extension", () => {
    expect(extOf("rain.mp3")).toBe("mp3");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });

  it("isAudio accepts known audio extensions case-insensitively", () => {
    expect(isAudio("MP3")).toBe(true);
    expect(isAudio("flac")).toBe(true);
    expect(isAudio("txt")).toBe(false);
    expect(isAudio("soundboard")).toBe(false);
  });

  it("labelOf drops folders and the extension", () => {
    expect(labelOf("Sounds/Rain/heavy rain.mp3")).toBe("heavy rain");
    expect(labelOf("plain")).toBe("plain");
    expect(labelOf("a.b.c.wav")).toBe("a.b.c");
  });

  it("plural adds an s except for one", () => {
    expect(plural(1, "sound")).toBe("1 sound");
    expect(plural(0, "sound")).toBe("0 sounds");
    expect(plural(3, "item")).toBe("3 items");
  });
});

describe("remapPath", () => {
  it("renames an exact match", () => {
    expect(remapPath("a/b.mp3", "a/b.mp3", "a/c.mp3")).toBe("a/c.mp3");
  });

  it("renames files inside a renamed folder", () => {
    expect(remapPath("Sounds/rain/a.mp3", "Sounds", "Audio")).toBe("Audio/rain/a.mp3");
  });

  it("does not touch folders that merely share a prefix", () => {
    expect(remapPath("Sounds2/a.mp3", "Sounds", "Audio")).toBe("Sounds2/a.mp3");
    expect(remapPath("Sounds.mp3", "Sounds", "Audio")).toBe("Sounds.mp3");
  });

  it("leaves unrelated paths alone", () => {
    expect(remapPath("x/y.mp3", "a", "b")).toBe("x/y.mp3");
  });

  it("property: anything under the old folder moves under the new one", () => {
    const segment = fc.stringMatching(/^[a-z0-9]{1,8}$/);
    fc.assert(
      fc.property(segment, segment, fc.array(segment, { minLength: 1, maxLength: 4 }), (oldDir, newDir, rest) => {
        const tail = rest.join("/");
        expect(remapPath(`${oldDir}/${tail}`, oldDir, newDir)).toBe(`${newDir}/${tail}`);
      })
    );
  });

  it("property: remapping to the same path changes nothing", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (path, other) => {
        expect(remapPath(path, other, other)).toBe(path);
      })
    );
  });
});

describe("validateFileName", () => {
  it("accepts ordinary names", () => {
    expect(validateFileName("heavy rain (2)")).toBeNull();
  });

  it("rejects empty names", () => {
    expect(validateFileName("")).toMatch(/enter a name/i);
  });

  it.each(["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"])("rejects %s", (name) => {
    expect(validateFileName(name)).toMatch(/cannot contain/i);
  });

  it("rejects names that start with a dot", () => {
    expect(validateFileName(".hidden")).toMatch(/dot/i);
  });
});

describe("place", () => {
  it("sets position, and size only when given", () => {
    const el = document.createElement("div");
    place(el, 10, 20);
    expect(el.style.left).toBe("10px");
    expect(el.style.top).toBe("20px");
    expect(el.style.width).toBe("");
    place(el, 1, 2, 300, 400);
    expect(el.style.width).toBe("300px");
    expect(el.style.height).toBe("400px");
  });
});
