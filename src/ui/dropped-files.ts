/** Reading files and folders dropped from the operating system. */

import { extOf, isAudio } from "../utils";

/** A file to import and where it sits relative to the dropped or chosen folder. */
export interface ImportItem {
  file: File;
  /** e.g. "Rain/heavy.mp3" for a file inside a dropped folder "Rain"; just the name for a lone file. */
  relPath: string;
}

/** Turns a file input's selection into import items (keeps folder structure when a folder was picked). */
export function fromFileList(files: FileList | null): ImportItem[] {
  return Array.from(files ?? [])
    .filter((f) => isAudio(extOf(f.name)))
    .map((file) => ({ file, relPath: file.webkitRelativePath || file.name }));
}

/**
 * Collects the audio files in a drop, descending into folders.
 * Must be called synchronously from the drop handler: the browser clears the
 * drop data once the handler yields.
 */
export async function readDropped(dt: DataTransfer): Promise<ImportItem[]> {
  const entries = Array.from(dt.items ?? [])
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (!entries.length) {
    return Array.from(dt.files)
      .filter((f) => isAudio(extOf(f.name)))
      .map((file) => ({ file, relPath: file.name }));
  }

  const items: ImportItem[] = [];
  for (const entry of entries) await walk(entry, items);
  return items;
}

async function walk(entry: FileSystemEntry, out: ImportItem[]) {
  if (entry.isFile) {
    if (!isAudio(extOf(entry.name))) return;
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, relPath: entry.fullPath.replace(/^\/+/, "") });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in batches; keep reading until it comes back empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
}
