import { App, FuzzySuggestModal, Modal, Setting, TFile, TFolder } from "obsidian";

/** Fuzzy search over vault files that pass `accept`. */
export class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    placeholder: string,
    private accept: (f: TFile) => boolean,
    private onPick: (f: TFile) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems() {
    return this.app.vault.getFiles().filter(this.accept);
  }

  getItemText(f: TFile) {
    return f.path;
  }

  onChooseItem(f: TFile) {
    this.onPick(f);
  }
}

/** Fuzzy search over a fixed list of folders. */
export class FolderPicker extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private folders: TFolder[], private onPick: (f: TFolder) => void) {
    super(app);
    this.setPlaceholder("Search folders that contain audio files");
  }

  getItems() {
    return this.folders;
  }

  getItemText(f: TFolder) {
    return f.path;
  }

  onChooseItem(f: TFolder) {
    this.onPick(f);
  }
}

/**
 * Asks for a new name. `submit` returns an error message to show in the dialog,
 * or null when the rename went through and the dialog can close.
 */
export class RenameModal extends Modal {
  constructor(
    app: App,
    private heading: string,
    private initial: string,
    private submit: (name: string) => Promise<string | null>
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.heading });

    const input = contentEl.createEl("input", { cls: "sb-modal-input", type: "text" });
    input.value = this.initial;
    const error = contentEl.createDiv({ cls: "sb-modal-error" });

    const confirm = async () => {
      const message = await this.submit(input.value.trim());
      if (message) error.setText(message);
      else this.close();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void confirm();
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Rename").setCta().onClick(() => void confirm()))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));

    input.focus();
    input.select();
  }

  onClose() {
    this.contentEl.empty();
  }
}
