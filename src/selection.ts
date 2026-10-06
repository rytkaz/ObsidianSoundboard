/** The set of selected node ids (cards and scenes). Reports every change to one listener. */
export class Selection {
  private ids = new Set<string>();

  constructor(private onChange: () => void) {}

  get size() {
    return this.ids.size;
  }

  has(id: string) {
    return this.ids.has(id);
  }

  /** A copy, so callers can iterate while the selection changes. */
  snapshot(): ReadonlySet<string> {
    return new Set(this.ids);
  }

  set(ids: Iterable<string>) {
    this.ids = new Set(ids);
    this.onChange();
  }

  add(id: string) {
    this.ids.add(id);
    this.onChange();
  }

  remove(id: string) {
    this.ids.delete(id);
    this.onChange();
  }

  clear() {
    this.set([]);
  }

  /** Drops ids whose nodes no longer exist. */
  prune(live: ReadonlySet<string>) {
    this.set([...this.ids].filter((id) => live.has(id)));
  }
}
