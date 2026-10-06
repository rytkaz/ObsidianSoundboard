import { Plugin, normalizePath } from "obsidian";
import { Rename, emptyBoard, remapBoardText } from "./board-model";
import { DEFAULT_SETTINGS, SoundboardSettingTab } from "./settings";
import { BOARD_EXT, Settings, VIEW_TYPE } from "./types";
import { SoundboardView } from "./ui/soundboard-view";

export default class SoundboardPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  private pendingRenames: Rename[] = [];
  private renameTimer = 0;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addSettingTab(new SoundboardSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new SoundboardView(leaf, this));
    this.registerExtensions([BOARD_EXT], VIEW_TYPE);

    this.addRibbonIcon("audio-lines", "New soundboard", () => this.createBoard());
    this.addCommand({
      id: "new-soundboard",
      name: "Create new soundboard",
      callback: () => this.createBoard(),
    });
    this.addBoardCommand("stop-all", "Stop all sounds on this soundboard", (view) => view.stopAll());
    this.addBoardCommand("undo", "Undo on this soundboard", (view) => view.undo());
    this.addBoardCommand("redo", "Redo on this soundboard", (view) => view.redo());

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.onVaultRename(file.path, oldPath))
    );
    this.register(() => window.clearTimeout(this.renameTimer));
  }

  saveSettings() {
    return this.saveData(this.settings);
  }

  /** Registers a command that is only available while a soundboard is the active view. */
  private addBoardCommand(id: string, name: string, run: (view: SoundboardView) => void) {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(SoundboardView);
        if (!view) return false;
        if (!checking) run(view);
        return true;
      },
    });
  }

  /** Tells every open board that a setting changed. */
  syncViews() {
    for (const view of this.openBoards()) view.syncToolbar();
  }

  async createBoard() {
    const parent = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? "");
    let path = normalizePath(`${parent.path}/Soundboard.${BOARD_EXT}`);
    for (let i = 1; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${parent.path}/Soundboard ${i}.${BOARD_EXT}`);
    }
    const file = await this.app.vault.create(path, JSON.stringify(emptyBoard(), null, 2));
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private openBoards() {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE)
      .map((leaf) => leaf.view)
      .filter((view): view is SoundboardView => view instanceof SoundboardView);
  }

  /**
   * Keeps sound paths valid after a rename. Open boards update straight away. Boards
   * that are not open are patched on disk once the burst of events has ended: renaming
   * a folder fires an event for the folder and for each file inside it, and the vault
   * is not fully consistent until they are all done.
   */
  private onVaultRename(newPath: string, oldPath: string) {
    for (const view of this.openBoards()) view.handleRename(newPath, oldPath);

    this.pendingRenames.push({ oldPath, newPath });
    window.clearTimeout(this.renameTimer);
    this.renameTimer = window.setTimeout(() => void this.patchClosedBoards(), 300);
  }

  private async patchClosedBoards() {
    const renames = this.pendingRenames.splice(0);
    if (!renames.length) return;

    const open = new Set(this.openBoards().map((view) => view.file?.path));
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== BOARD_EXT || open.has(file.path)) continue;
      try {
        // Cheap check first, so unrelated boards are not rewritten.
        const text = await this.app.vault.cachedRead(file);
        if (!renames.some((r) => text.includes(JSON.stringify(r.oldPath).slice(1, -1)))) continue;
        await this.app.vault.process(file, (raw) => remapBoardText(raw, renames));
      } catch (err) {
        console.error(`Soundboard: could not update paths in "${file.path}"`, err);
      }
    }
  }
}
