/**
 * A small in-memory stand-in for the parts of the Obsidian API the plugin uses.
 * It is not a faithful copy of Obsidian: it only has to behave well enough to test our code.
 */

export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (p !== "/") p = p.replace(/^\/+|\/+$/g, "");
  return p === "" ? "/" : p;
}

export class Notice {
  static messages: string[] = [];
  static clear() {
    Notice.messages = [];
  }
  constructor(public message: string) {
    Notice.messages.push(message);
  }
}

/* ---------- files and the vault ---------- */

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  constructor(path = "") {
    super();
    this.setPath(path);
  }
  setPath(path: string) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    const dot = this.name.lastIndexOf(".");
    this.basename = dot < 0 ? this.name : this.name.slice(0, dot);
    this.extension = dot < 0 ? "" : this.name.slice(dot + 1);
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  constructor(path = "/") {
    super();
    this.setPath(path);
  }
  setPath(path: string) {
    this.path = path;
    this.name = path === "/" ? "" : (path.split("/").pop() ?? path);
  }
  isRoot() {
    return this.path === "/";
  }
}

type Listener = (...args: any[]) => unknown;

export class Vault {
  readonly root = new TFolder("/");
  /** Every write made through modify/process, for asserting that files were (not) rewritten. */
  writeLog: string[] = [];
  private nodes = new Map<string, TAbstractFile>([["/", this.root]]);
  private content = new Map<string, string | ArrayBuffer>();
  private listeners = new Map<string, Listener[]>();

  static recurseChildren(root: TFolder, cb: (file: TAbstractFile) => unknown) {
    for (const child of root.children) {
      cb(child);
      if (child instanceof TFolder) Vault.recurseChildren(child, cb);
    }
  }

  /* ----- lookups ----- */

  getAbstractFileByPath(path: string) {
    return this.nodes.get(normalizePath(path)) ?? null;
  }

  getFiles() {
    return [...this.nodes.values()].filter((n): n is TFile => n instanceof TFile);
  }

  /* ----- creating ----- */

  /** Test helper: creates a file (and any missing folders) synchronously. */
  addFile(path: string, content: string | ArrayBuffer = "") {
    const p = normalizePath(path);
    const folderPath = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "/";
    const parent = this.ensureFolder(folderPath);
    const file = new TFile(p);
    file.parent = parent;
    parent.children.push(file);
    this.nodes.set(p, file);
    this.content.set(p, content);
    return file;
  }

  async createFolder(path: string) {
    if (this.getAbstractFileByPath(path)) throw new Error("Folder already exists.");
    return this.ensureFolder(normalizePath(path));
  }

  async create(path: string, text: string) {
    if (this.getAbstractFileByPath(path)) throw new Error("File already exists.");
    return this.addFile(path, text);
  }

  async createBinary(path: string, data: ArrayBuffer) {
    if (this.getAbstractFileByPath(path)) throw new Error("File already exists.");
    return this.addFile(path, data);
  }

  private ensureFolder(path: string): TFolder {
    if (path === "/") return this.root;
    let parent = this.root;
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      let folder = this.nodes.get(current) as TFolder | undefined;
      if (!folder) {
        folder = new TFolder(current);
        folder.parent = parent;
        parent.children.push(folder);
        this.nodes.set(current, folder);
      }
      parent = folder;
    }
    return parent;
  }

  /* ----- reading and writing ----- */

  private text(file: TFile) {
    const c = this.content.get(file.path);
    if (c === undefined) throw new Error(`ENOENT: ${file.path}`);
    return typeof c === "string" ? c : "";
  }

  async read(file: TFile) {
    return this.text(file);
  }

  async cachedRead(file: TFile) {
    return this.text(file);
  }

  async modify(file: TFile, text: string) {
    this.writeLog.push(file.path);
    this.content.set(file.path, text);
  }

  async process(file: TFile, fn: (text: string) => string) {
    const next = fn(this.text(file));
    this.writeLog.push(file.path);
    this.content.set(file.path, next);
    return next;
  }

  /** Test helper: current text of a file. */
  textOf(path: string) {
    return this.text(this.getAbstractFileByPath(path) as TFile);
  }

  getResourcePath(file: TFile) {
    return `app://local/${file.path}`;
  }

  /* ----- renaming ----- */

  /**
   * Renames a file or folder and fires "rename" events the way Obsidian does for a folder:
   * one for the folder, then one per descendant.
   *
   * "staged" fires the folder's event before its children have been moved in the tree
   * (the vault is briefly inconsistent); "settled" moves everything first, then fires.
   */
  async rename(file: TAbstractFile, newPath: string, order: "staged" | "settled" = "staged") {
    const target = normalizePath(newPath);
    const oldPath = file.path;
    const descendants: TAbstractFile[] = [];
    if (file instanceof TFolder) Vault.recurseChildren(file, (c) => descendants.push(c));

    const moves: { node: TAbstractFile; oldPath: string }[] = [{ node: file, oldPath }];
    this.move(file, target);
    if (order === "staged") this.trigger("rename", file, oldPath);

    for (const child of descendants) {
      const before = child.path;
      this.move(child, target + before.slice(oldPath.length));
      moves.push({ node: child, oldPath: before });
      if (order === "staged") this.trigger("rename", child, before);
    }
    if (order === "settled") for (const m of moves) this.trigger("rename", m.node, m.oldPath);
  }

  private move(node: TAbstractFile, newPath: string) {
    const oldPath = node.path;
    this.nodes.delete(oldPath);
    if (node instanceof TFile) {
      node.setPath(newPath);
      const c = this.content.get(oldPath);
      this.content.delete(oldPath);
      if (c !== undefined) this.content.set(newPath, c);
    } else if (node instanceof TFolder) {
      node.setPath(newPath);
    }
    this.nodes.set(newPath, node);

    const dir = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "/";
    const newParent = this.ensureFolder(dir);
    if (node.parent !== newParent) {
      node.parent?.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = newParent;
      newParent.children.push(node);
    }
  }

  /* ----- events ----- */

  on(name: string, cb: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), cb]);
    return { name, cb };
  }

  trigger(name: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(name) ?? []) cb(...args);
  }
}

/* ---------- workspace and app ---------- */

export class WorkspaceLeaf {
  view: any = null;
  opened: TFile[] = [];
  constructor(public app: App) {}
  async openFile(file: TFile) {
    this.opened.push(file);
  }
}

export class Workspace {
  leaves: WorkspaceLeaf[] = [];
  activeView: unknown = null;
  activeFile: TFile | null = null;
  constructor(private app: App) {}
  getLeavesOfType(type: string) {
    return this.leaves.filter((l) => l.view?.getViewType?.() === type);
  }
  getActiveViewOfType<T>(cls: new (...args: any[]) => T): T | null {
    return this.activeView instanceof cls ? this.activeView : null;
  }
  getActiveFile() {
    return this.activeFile;
  }
  getLeaf(_newLeaf?: boolean) {
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    return leaf;
  }
}

export class FileManager {
  constructor(private vault: Vault) {}
  getNewFileParent(_sourcePath: string) {
    return this.vault.root;
  }
  async renameFile(file: TAbstractFile, newPath: string) {
    await this.vault.rename(file, newPath);
  }
}

export class App {
  vault = new Vault();
  workspace = new Workspace(this);
  fileManager = new FileManager(this.vault);
}

/* ---------- views ---------- */

export class TextFileView {
  app: App;
  file: TFile | null = null;
  contentEl: HTMLElement;
  saveRequests = 0;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = leaf.app;
    this.contentEl = document.createElement("div");
  }
  requestSave() {
    this.saveRequests++;
  }
}

/* ---------- plugin ---------- */

export class Plugin {
  commands = new Map<
    string,
    { id: string; name: string; callback?: () => void; checkCallback?: (c: boolean) => unknown }
  >();
  views = new Map<string, (leaf: WorkspaceLeaf) => unknown>();
  extensions: string[] = [];
  ribbonIcons: { icon: string; title: string; cb: () => void }[] = [];
  settingTabs: unknown[] = [];
  cleanups: (() => void)[] = [];
  private store: unknown = null;
  constructor(
    public app: App,
    public manifest: unknown
  ) {}
  async loadData() {
    return this.store;
  }
  async saveData(data: unknown) {
    this.store = JSON.parse(JSON.stringify(data));
  }
  addCommand(cmd: any) {
    this.commands.set(cmd.id, cmd);
    return cmd;
  }
  addRibbonIcon(icon: string, title: string, cb: () => void) {
    this.ribbonIcons.push({ icon, title, cb });
  }
  addSettingTab(tab: unknown) {
    this.settingTabs.push(tab);
  }
  registerView(type: string, creator: (leaf: WorkspaceLeaf) => unknown) {
    this.views.set(type, creator);
  }
  registerExtensions(exts: string[], _type: string) {
    this.extensions.push(...exts);
  }
  registerEvent(_ref: unknown) {}
  register(cb: () => void) {
    this.cleanups.push(cb);
  }
}

/* ---------- menus and modals ---------- */

export class MenuItem {
  title = "";
  icon = "";
  disabled = false;
  warning = false;
  callback: (() => unknown) | null = null;
  setTitle(t: string) {
    this.title = t;
    return this;
  }
  setIcon(i: string) {
    this.icon = i;
    return this;
  }
  setDisabled(d: boolean) {
    this.disabled = d;
    return this;
  }
  setWarning(w: boolean) {
    this.warning = w;
    return this;
  }
  onClick(cb: () => unknown) {
    this.callback = cb;
    return this;
  }
}

export class Menu {
  static last: Menu | null = null;
  items: (MenuItem | "separator")[] = [];
  addItem(cb: (item: MenuItem) => unknown) {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() {
    this.items.push("separator");
    return this;
  }
  showAtMouseEvent(_e: MouseEvent) {
    Menu.last = this;
  }
  /** Test helpers */
  get titles() {
    return this.items.filter((i): i is MenuItem => i !== "separator").map((i) => i.title);
  }
  item(title: string) {
    const found = this.items.find((i): i is MenuItem => i !== "separator" && i.title === title);
    if (!found) throw new Error(`No menu item "${title}". Items: ${this.titles.join(", ")}`);
    return found;
  }
  click(title: string) {
    const item = this.item(title);
    if (item.disabled) throw new Error(`Menu item "${title}" is disabled`);
    return item.callback?.();
  }
}

export class Modal {
  /** The most recently opened modal. */
  static last: Modal | null = null;
  contentEl = document.createElement("div");
  constructor(public app: App) {}
  open() {
    Modal.last = this;
    this.onOpen();
  }
  close() {
    this.onClose();
  }
  onOpen() {}
  onClose() {}
}

export class FuzzySuggestModal<T> {
  static opened: FuzzySuggestModal<any>[] = [];
  static clear() {
    FuzzySuggestModal.opened = [];
  }
  placeholder = "";
  constructor(public app: App) {}
  setPlaceholder(p: string) {
    this.placeholder = p;
  }
  open() {
    FuzzySuggestModal.opened.push(this);
  }
  getItems(): T[] {
    return [];
  }
  getItemText(_item: T): string {
    return "";
  }
  onChooseItem(_item: T): void {}
}

/* ---------- settings UI ---------- */

export class ToggleComponent {
  value = false;
  handler?: (v: boolean) => unknown;
  setValue(v: boolean) {
    this.value = v;
    return this;
  }
  onChange(cb: (v: boolean) => unknown) {
    this.handler = cb;
    return this;
  }
}

export class SliderComponent {
  value = 0;
  limits: number[] = [];
  handler?: (v: number) => unknown;
  setLimits(min: number, max: number, step: number) {
    this.limits = [min, max, step];
    return this;
  }
  setValue(v: number) {
    this.value = v;
    return this;
  }
  setDynamicTooltip() {
    return this;
  }
  onChange(cb: (v: number) => unknown) {
    this.handler = cb;
    return this;
  }
}

export class DropdownComponent {
  options: Record<string, string> = {};
  value = "";
  handler?: (v: string) => unknown;
  addOption(key: string, label: string) {
    this.options[key] = label;
    return this;
  }
  setValue(v: string) {
    this.value = v;
    return this;
  }
  onChange(cb: (v: string) => unknown) {
    this.handler = cb;
    return this;
  }
}

export class ButtonComponent {
  buttonEl = document.createElement("button");
  setButtonText(t: string) {
    this.buttonEl.textContent = t;
    return this;
  }
  setCta() {
    return this;
  }
  onClick(cb: () => unknown) {
    this.buttonEl.addEventListener("click", () => cb());
    return this;
  }
}

export class Setting {
  static all: Setting[] = [];
  static clear() {
    Setting.all = [];
  }
  name = "";
  desc = "";
  controls: any[] = [];
  private el: HTMLElement;
  constructor(containerEl: HTMLElement) {
    Setting.all.push(this);
    this.el = containerEl.appendChild(document.createElement("div"));
  }
  setName(n: string) {
    this.name = n;
    return this;
  }
  setDesc(d: string) {
    this.desc = d;
    return this;
  }
  addToggle(cb: (c: ToggleComponent) => unknown) {
    const c = new ToggleComponent();
    cb(c);
    this.controls.push(c);
    return this;
  }
  addSlider(cb: (c: SliderComponent) => unknown) {
    const c = new SliderComponent();
    cb(c);
    this.controls.push(c);
    return this;
  }
  addDropdown(cb: (c: DropdownComponent) => unknown) {
    const c = new DropdownComponent();
    cb(c);
    this.controls.push(c);
    return this;
  }
  addButton(cb: (c: ButtonComponent) => unknown) {
    const c = new ButtonComponent();
    cb(c);
    this.el.appendChild(c.buttonEl);
    this.controls.push(c);
    return this;
  }
  /** Test helper: finds a setting by its name. */
  static named(name: string) {
    const s = Setting.all.find((x) => x.name === name);
    if (!s) throw new Error(`No setting named "${name}"`);
    return s;
  }
}

export class PluginSettingTab {
  containerEl = document.createElement("div");
  constructor(
    public app: App,
    public plugin: Plugin
  ) {}
}

export function setIcon(el: HTMLElement, name: string) {
  el.setAttribute("data-lucide", name);
}
