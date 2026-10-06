import { describe, expect, it, vi } from "vitest";
import { Selection } from "../src/selection";

describe("Selection", () => {
  it("starts empty", () => {
    const sel = new Selection(() => {});
    expect(sel.size).toBe(0);
    expect(sel.has("a")).toBe(false);
  });

  it("set, add, remove and clear notify the listener", () => {
    const onChange = vi.fn();
    const sel = new Selection(onChange);
    sel.set(["a", "b"]);
    sel.add("c");
    sel.remove("a");
    sel.clear();
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("tracks membership", () => {
    const sel = new Selection(() => {});
    sel.set(["a", "b"]);
    sel.add("c");
    sel.remove("a");
    expect([sel.has("a"), sel.has("b"), sel.has("c")]).toEqual([false, true, true]);
    expect(sel.size).toBe(2);
  });

  it("set replaces the previous selection", () => {
    const sel = new Selection(() => {});
    sel.set(["a"]);
    sel.set(["b"]);
    expect(sel.has("a")).toBe(false);
    expect(sel.has("b")).toBe(true);
  });

  it("snapshot is a copy that later changes do not affect", () => {
    const sel = new Selection(() => {});
    sel.set(["a"]);
    const snap = sel.snapshot();
    sel.add("b");
    expect([...snap]).toEqual(["a"]);
  });

  it("prune drops ids that no longer exist", () => {
    const sel = new Selection(() => {});
    sel.set(["a", "b", "c"]);
    sel.prune(new Set(["b"]));
    expect([...sel.snapshot()]).toEqual(["b"]);
  });
});
