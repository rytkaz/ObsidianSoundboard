/** Opens a real SoundboardView (and plugin) on top of the Obsidian mock. */
import SoundboardPlugin from "../../src/main";
import { SoundboardView } from "../../src/ui/soundboard-view";
import type { BoardData, Settings } from "../../src/types";
import { App, WorkspaceLeaf, type Plugin as MockPlugin } from "../mocks/obsidian";
import { makeBoard } from "./builders";

/** The plugin as the tests see it: our class plus what the Obsidian mock records. */
export type TestPlugin = SoundboardPlugin &
  Pick<MockPlugin, "commands" | "views" | "extensions" | "ribbonIcons" | "settingTabs">;

/** The view as the tests see it: our class plus the mock's save counter. */
export type TestView = SoundboardView & { saveRequests: number };

export async function createPlugin(app = new App(), settings: Partial<Settings> = {}) {
  const plugin = new SoundboardPlugin(app as never, {} as never) as TestPlugin;
  await plugin.onload();
  Object.assign(plugin.settings, { fadeMs: 0, soundFadeMs: 0 }, settings);
  return plugin;
}

export interface OpenOptions {
  app?: App;
  plugin?: TestPlugin;
  path?: string;
  settings?: Partial<Settings>;
}

export async function openBoard(board: Partial<BoardData> = {}, options: OpenOptions = {}) {
  const app = options.app ?? new App();
  const plugin = options.plugin ?? (await createPlugin(app, options.settings));
  const data = makeBoard(board);
  const file = app.vault.addFile(options.path ?? "Board.soundboard", JSON.stringify(data));

  const leaf = new WorkspaceLeaf(app);
  const view = new SoundboardView(leaf as never, plugin) as TestView;
  leaf.view = view;
  view.file = file as never;
  app.workspace.leaves.push(leaf);
  app.workspace.activeView = view;

  document.body.appendChild(view.contentEl);
  await view.onOpen();
  view.setViewData(JSON.stringify(data), true);
  return { app, plugin, view, file, vault: app.vault, board: view.board };
}

/** An app whose vault already holds these (empty) files. */
export function appWithFiles(...paths: string[]) {
  const app = new App();
  for (const path of paths) app.vault.addFile(path);
  return app;
}

/** Lets pending promise callbacks run (play buttons start sounds asynchronously). */
export async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/* ----- DOM helpers ----- */

export const cardEls = (view: SoundboardView) => [...view.contentEl.querySelectorAll<HTMLElement>(".sb-card")];
export const sceneEls = (view: SoundboardView) => [...view.contentEl.querySelectorAll<HTMLElement>(".sb-scene")];
export const cardEl = (view: SoundboardView, index = 0) => cardEls(view)[index];

export function pointer(type: string, target: EventTarget, init: PointerEventInit = {}) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
}

/** Press on `target`, move the pointer by (dx, dy) screen pixels, release. */
export function dragBy(target: HTMLElement, dx: number, dy: number, init: PointerEventInit = {}) {
  const x = init.clientX ?? 0;
  const y = init.clientY ?? 0;
  pointer("pointerdown", target, { ...init, clientX: x, clientY: y });
  pointer("pointermove", window, { ...init, clientX: x + dx, clientY: y + dy });
  pointer("pointerup", window, { ...init, clientX: x + dx, clientY: y + dy });
}

/** Drag a selection box on empty space from (x1, y1) to (x2, y2). */
export function boxSelect(
  view: SoundboardView,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  init: PointerEventInit = {}
) {
  pointer("pointerdown", view.viewportEl, { ...init, clientX: x1, clientY: y1 });
  pointer("pointermove", window, { ...init, clientX: x2, clientY: y2 });
  pointer("pointerup", window, { ...init, clientX: x2, clientY: y2 });
}

export function key(view: SoundboardView, k: string, init: KeyboardEventInit = {}) {
  view.contentEl.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
}

export const ctrl = (view: SoundboardView, k: string, init: KeyboardEventInit = {}) =>
  key(view, k, { ctrlKey: true, ...init });

export function rightClick(target: HTMLElement) {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
}
