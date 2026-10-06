/**
 * Undo/redo as snapshots of a board's content (cards and scenes, not pan/zoom).
 * Each snapshot is the board's JSON text. `commit` is called after every change.
 */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  /** The snapshot matching what is currently on the board. */
  private present = "";
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(private limit = 100) {}

  /** Starts a fresh history from this state (e.g. when a file is opened). */
  reset(state: string) {
    this.undoStack = [];
    this.redoStack = [];
    this.present = state;
    this.lastKey = null;
  }

  /**
   * Records a change. Does nothing if the content is unchanged.
   * Commits with the same `coalesceKey` in quick succession (a slider being
   * dragged, say) are merged into a single undo step.
   */
  commit(state: string, coalesceKey?: string) {
    if (state === this.present) return;

    const now = Date.now();
    const merge =
      coalesceKey !== undefined &&
      coalesceKey === this.lastKey &&
      now - this.lastTime < 1500 &&
      this.undoStack.length > 0;

    if (!merge) {
      this.undoStack.push(this.present);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.present = state;
    this.redoStack = [];
    this.lastKey = coalesceKey ?? null;
    this.lastTime = now;
  }

  /** Steps back; returns the snapshot to show, or null if there is nothing to undo. */
  undo(): string | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(this.present);
    this.present = previous;
    this.lastKey = null;
    return previous;
  }

  /** Steps forward; returns the snapshot to show, or null if there is nothing to redo. */
  redo(): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.present);
    this.present = next;
    this.lastKey = null;
    return next;
  }

  /** Rewrites every stored snapshot (used when a renamed file changes paths in all of them). */
  remap(transform: (state: string) => string) {
    this.undoStack = this.undoStack.map(transform);
    this.redoStack = this.redoStack.map(transform);
    this.present = transform(this.present);
  }
}
