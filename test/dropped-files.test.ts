import { describe, expect, it } from "vitest";
import { fromFileList, readDropped } from "../src/ui/dropped-files";

function fileWithPath(name: string, relPath = ""): File {
  const f = new File(["x"], name);
  Object.defineProperty(f, "webkitRelativePath", { value: relPath });
  return f;
}

const fileEntry = (fullPath: string) => ({
  isFile: true,
  isDirectory: false,
  name: fullPath.split("/").pop()!,
  fullPath,
  file: (ok: (f: File) => void) => ok(new File(["x"], fullPath.split("/").pop()!)),
});

/** A directory whose readEntries hands out `batchSize` children per call, then an empty list. */
const dirEntry = (fullPath: string, children: unknown[], batchSize = 2) => ({
  isFile: false,
  isDirectory: true,
  name: fullPath.split("/").pop()!,
  fullPath,
  createReader() {
    let i = 0;
    return {
      readEntries(ok: (batch: unknown[]) => void) {
        ok(children.slice(i, i + batchSize));
        i += batchSize;
      },
    };
  },
});

const dropOf = (entries: unknown[], files: File[] = []) =>
  ({
    items: entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e })),
    files,
  }) as unknown as DataTransfer;

describe("fromFileList", () => {
  it("returns nothing for null", () => {
    expect(fromFileList(null)).toEqual([]);
  });

  it("keeps only audio and uses the relative path when present", () => {
    const list = [
      fileWithPath("rain.mp3", "Rain/rain.mp3"),
      fileWithPath("notes.txt", "Rain/notes.txt"),
      fileWithPath("a.wav"),
    ];
    const items = fromFileList(list as unknown as FileList);
    expect(items.map((i) => i.relPath)).toEqual(["Rain/rain.mp3", "a.wav"]);
  });
});

describe("readDropped", () => {
  it("reads lone files", async () => {
    const items = await readDropped(dropOf([fileEntry("/a.mp3"), fileEntry("/b.txt")]));
    expect(items.map((i) => i.relPath)).toEqual(["a.mp3"]);
  });

  it("walks folders recursively and strips the leading slash", async () => {
    const tree = dirEntry("/Rain", [
      fileEntry("/Rain/heavy.mp3"),
      dirEntry("/Rain/Storm", [fileEntry("/Rain/Storm/thunder.ogg")]),
    ]);
    const items = await readDropped(dropOf([tree]));
    expect(items.map((i) => i.relPath).sort()).toEqual(["Rain/Storm/thunder.ogg", "Rain/heavy.mp3"]);
  });

  it("keeps reading until the reader reports no more batches", async () => {
    const children = ["1", "2", "3", "4", "5"].map((n) => fileEntry(`/Many/${n}.mp3`));
    const items = await readDropped(dropOf([dirEntry("/Many", children, 2)]));
    expect(items).toHaveLength(5);
  });

  it("skips non-audio files without reading them", async () => {
    let read = false;
    const text = { ...fileEntry("/Folder/readme.txt"), file: () => (read = true) };
    const items = await readDropped(dropOf([dirEntry("/Folder", [text, fileEntry("/Folder/a.mp3")])]));
    expect(items).toHaveLength(1);
    expect(read).toBe(false);
  });

  it("falls back to dataTransfer.files when entries are unavailable", async () => {
    const dt = { items: [], files: [new File(["x"], "a.mp3"), new File(["x"], "b.txt")] } as unknown as DataTransfer;
    const items = await readDropped(dt);
    expect(items.map((i) => i.relPath)).toEqual(["a.mp3"]);
  });
});
