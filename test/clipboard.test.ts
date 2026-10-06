import { beforeEach, describe, expect, it, vi } from "vitest";
import { copyNodes, hasClipboard, pasteNodes } from "../src/clipboard";
import { makeBoard, makeScene, makeSound } from "./helpers/builders";

const ids = (...nodes: { id: string }[]) => new Set(nodes.map((n) => n.id));

describe("clipboard", () => {
  describe("copyNodes", () => {
    it("copies the selected cards", () => {
      const a = makeSound({ x: 0 });
      const b = makeSound({ x: 500 });
      expect(copyNodes(makeBoard({ sounds: [a, b] }), ids(a))).toBe(1);
      expect(hasClipboard()).toBe(true);
    });

    it("brings along the cards inside a copied scene", () => {
      const inside = makeSound({ x: 10, y: 10 });
      const outside = makeSound({ x: 2000, y: 2000 });
      const scene = makeScene({ x: 0, y: 0, w: 400, h: 300 });
      const board = makeBoard({ sounds: [inside, outside], scenes: [scene] });
      expect(copyNodes(board, ids(scene))).toBe(2);
    });

    it("counts a card once even if it is selected and inside a selected scene", () => {
      const inside = makeSound({ x: 10, y: 10 });
      const scene = makeScene({ x: 0, y: 0, w: 400, h: 300 });
      expect(copyNodes(makeBoard({ sounds: [inside], scenes: [scene] }), ids(inside, scene))).toBe(2);
    });

    it("copies nothing and keeps the old clipboard when the selection is empty", () => {
      const a = makeSound();
      const board = makeBoard({ sounds: [a] });
      copyNodes(board, ids(a));
      expect(copyNodes(board, new Set())).toBe(0);
      expect(pasteNodes(board, { x: 0, y: 0 }, 0)?.ids).toHaveLength(1);
    });
  });

  describe("pasteNodes", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("returns null when nothing has been copied", async () => {
      const fresh = await import("../src/clipboard");
      expect(fresh.pasteNodes(makeBoard(), { x: 0, y: 0 }, 0)).toBeNull();
    });

    it("adds copies with new ids, placed at the target with the layout kept", () => {
      const a = makeSound({ id: "a", x: 100, y: 100 });
      const b = makeSound({ id: "b", x: 400, y: 150 });
      const source = makeBoard({ sounds: [a, b] });
      copyNodes(source, ids(a, b));

      const target = makeBoard();
      const result = pasteNodes(target, { x: 1000, y: 2000 }, 0)!;

      expect(result.ids).toHaveLength(2);
      expect(result.ids).not.toContain("a");
      const [first, second] = target.sounds;
      expect({ x: first.x, y: first.y }).toEqual({ x: 1000, y: 2000 });
      expect({ x: second.x, y: second.y }).toEqual({ x: 1300, y: 2050 });
    });

    it("applies the nudge offset", () => {
      const a = makeSound({ x: 0, y: 0 });
      copyNodes(makeBoard({ sounds: [a] }), ids(a));
      const target = makeBoard();
      pasteNodes(target, { x: 10, y: 10 }, 24);
      expect(target.sounds[0]).toMatchObject({ x: 34, y: 34 });
    });

    it("pastes scenes along with their cards", () => {
      const inside = makeSound({ x: 20, y: 20 });
      const scene = makeScene({ x: 0, y: 0 });
      copyNodes(makeBoard({ sounds: [inside], scenes: [scene] }), ids(scene));
      const target = makeBoard();
      pasteNodes(target, { x: 500, y: 500 }, 0);
      expect(target.scenes).toHaveLength(1);
      expect(target.sounds).toHaveLength(1);
      expect(target.scenes[0]).toMatchObject({ x: 500, y: 500 });
      expect(target.sounds[0]).toMatchObject({ x: 520, y: 520 });
    });

    it("leaves out a nested soundboard that would contain itself", () => {
      const self = makeSound({ kind: "board", path: "Me.soundboard" });
      const other = makeSound({ kind: "board", path: "Other.soundboard", x: 400 });
      copyNodes(makeBoard({ sounds: [self, other] }), ids(self, other));
      const target = makeBoard();
      const result = pasteNodes(target, { x: 0, y: 0 }, 0, "Me.soundboard")!;
      expect(result.skippedSelf).toBe(true);
      expect(target.sounds.map((s) => s.path)).toEqual(["Other.soundboard"]);
    });

    it("is not affected by later edits to the source", () => {
      const a = makeSound({ x: 0, y: 0, volume: 0.5 });
      const board = makeBoard({ sounds: [a] });
      copyNodes(board, ids(a));
      a.volume = 1;
      const target = makeBoard();
      pasteNodes(target, { x: 0, y: 0 }, 0);
      expect(target.sounds[0].volume).toBe(0.5);
    });

    it("can paste the same clipboard repeatedly", () => {
      const a = makeSound();
      copyNodes(makeBoard({ sounds: [a] }), ids(a));
      const target = makeBoard();
      pasteNodes(target, { x: 0, y: 0 }, 0);
      pasteNodes(target, { x: 0, y: 0 }, 24);
      expect(target.sounds).toHaveLength(2);
      expect(target.sounds[0].id).not.toBe(target.sounds[1].id);
    });

    it("keeps custom card sizes", () => {
      const a = makeSound({ w: 300, h: 120 });
      copyNodes(makeBoard({ sounds: [a] }), ids(a));
      const target = makeBoard();
      pasteNodes(target, { x: 0, y: 0 }, 0);
      expect(target.sounds[0]).toMatchObject({ w: 300, h: 120 });
    });
  });
});
