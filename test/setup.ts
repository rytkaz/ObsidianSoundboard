/**
 * Runs before every test file: adds the DOM helpers Obsidian puts on elements,
 * installs a fake Audio, and resets shared mock state between tests.
 */
import { afterEach } from "vitest";
import { FuzzySuggestModal, Menu, Modal, Notice, Setting } from "./mocks/obsidian";
import { FakeAudio } from "./helpers/fake-audio";

type Info = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  type?: string;
  title?: string;
  value?: string;
};

function build(tag: string, info?: string | Info): HTMLElement {
  const el = document.createElement(tag);
  const o: Info = typeof info === "string" ? { cls: info } : (info ?? {});
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.type) (el as HTMLInputElement).type = o.type;
  if (o.title) el.title = o.title;
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  for (const [k, v] of Object.entries(o.attr ?? {})) if (v !== null) el.setAttribute(k, String(v));
  return el;
}

Object.assign(HTMLElement.prototype, {
  createEl(this: HTMLElement, tag: string, info?: string | Info, cb?: (el: HTMLElement) => void) {
    const el = build(tag, info);
    this.appendChild(el);
    cb?.(el);
    return el;
  },
  createDiv(this: HTMLElement, info?: string | Info) {
    return (this as any).createEl("div", info);
  },
  createSpan(this: HTMLElement, info?: string | Info) {
    return (this as any).createEl("span", info);
  },
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  addClass(this: HTMLElement, ...c: string[]) {
    this.classList.add(...c);
  },
  removeClass(this: HTMLElement, ...c: string[]) {
    this.classList.remove(...c);
  },
  toggleClass(this: HTMLElement, c: string | string[], on: boolean) {
    for (const name of Array.isArray(c) ? c : [c]) this.classList.toggle(name, on);
  },
  setAttr(this: HTMLElement, k: string, v: string | number | boolean | null) {
    if (v === null) this.removeAttribute(k);
    else this.setAttribute(k, String(v));
  },
  setText(this: HTMLElement, t: string) {
    this.textContent = t;
  },
  hide(this: HTMLElement) {
    this.style.display = "none";
  },
  show(this: HTMLElement) {
    this.style.display = "";
  },
});

// `element.win` is the window the element lives in.
Object.defineProperty(Node.prototype, "win", { get: () => globalThis, configurable: true });
(globalThis as any).createEl = (tag: string, info?: string | Info) => build(tag, info);

// jsdom gaps
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    pointerId = 1;
    pointerType = "mouse";
  };
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

(globalThis as any).Audio = FakeAudio;

afterEach(() => {
  Notice.clear();
  FuzzySuggestModal.clear();
  Setting.clear();
  FakeAudio.clear();
  Menu.last = null;
  Modal.last = null;
  document.body.replaceChildren();
});
