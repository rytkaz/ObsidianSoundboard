import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { History } from "../src/history";

describe("History", () => {
  it("undoes and redoes in order", () => {
    const h = new History();
    h.reset("a");
    h.commit("b");
    h.commit("c");
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.redo()).toBeNull();
  });

  it("ignores commits that do not change anything", () => {
    const h = new History();
    h.reset("a");
    h.commit("a");
    expect(h.undo()).toBeNull();
  });

  it("drops the redo stack when a new change is made", () => {
    const h = new History();
    h.reset("a");
    h.commit("b");
    h.undo();
    h.commit("c");
    expect(h.redo()).toBeNull();
    expect(h.undo()).toBe("a");
  });

  it("reset clears everything", () => {
    const h = new History();
    h.reset("a");
    h.commit("b");
    h.reset("x");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("keeps at most `limit` undo steps", () => {
    const h = new History(3);
    h.reset("0");
    for (let i = 1; i <= 10; i++) h.commit(String(i));
    const seen: string[] = [];
    for (let s = h.undo(); s !== null; s = h.undo()) seen.push(s);
    expect(seen).toEqual(["9", "8", "7"]);
  });

  it("remap rewrites the present, undo and redo states", () => {
    const h = new History();
    h.reset("a");
    h.commit("b");
    h.commit("c");
    h.undo();
    h.remap((s) => s.toUpperCase());
    expect(h.undo()).toBe("A");
    expect(h.redo()).toBe("B");
    expect(h.redo()).toBe("C");
  });

  describe("coalescing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("merges quick commits with the same key into one step", () => {
      const h = new History();
      h.reset("0");
      h.commit("1", "volume");
      vi.advanceTimersByTime(200);
      h.commit("2", "volume");
      vi.advanceTimersByTime(200);
      h.commit("3", "volume");
      expect(h.undo()).toBe("0");
      expect(h.redo()).toBe("3");
    });

    it("does not merge different keys", () => {
      const h = new History();
      h.reset("0");
      h.commit("1", "a");
      h.commit("2", "b");
      expect(h.undo()).toBe("1");
    });

    it("does not merge once the pause is long enough", () => {
      const h = new History();
      h.reset("0");
      h.commit("1", "volume");
      vi.advanceTimersByTime(2000);
      h.commit("2", "volume");
      expect(h.undo()).toBe("1");
    });

    it("does not merge commits without a key", () => {
      const h = new History();
      h.reset("0");
      h.commit("1");
      h.commit("2");
      expect(h.undo()).toBe("1");
    });

    it("a step after undo starts fresh even with a matching key", () => {
      const h = new History();
      h.reset("0");
      h.commit("1", "k");
      h.undo();
      h.commit("2", "k");
      expect(h.undo()).toBe("0");
    });
  });

  it("property: undoing everything returns to the start, redoing everything returns to the end", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 20 }), (nums) => {
        const states = nums.map((n, i) => `s${i}-${n}`);
        const h = new History(1000);
        h.reset("start");
        states.forEach((s) => h.commit(s));

        let last: string | null = null;
        for (let s = h.undo(); s !== null; s = h.undo()) last = s;
        expect(last).toBe(states.length ? "start" : null);

        let end: string | null = null;
        for (let s = h.redo(); s !== null; s = h.redo()) end = s;
        expect(end).toBe(states.length ? states[states.length - 1] : null);
      })
    );
  });
});
