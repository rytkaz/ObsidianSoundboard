import type { Point } from "../types";
import { clamp } from "../utils";
import type { BoardHost } from "./host";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const GRID = 28;

/** Pan and zoom of the board, and conversion between screen and board coordinates. */
export class Camera {
  constructor(private host: BoardHost) {}

  /** Applies the board's view (offset and zoom) to the DOM. */
  apply() {
    const { viewportEl, worldEl, board, toolbar } = this.host;
    const v = board.view;
    worldEl.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    viewportEl.style.backgroundSize = `${GRID * v.zoom}px ${GRID * v.zoom}px`;
    viewportEl.style.backgroundPosition = `${v.x}px ${v.y}px`;
    toolbar.setZoom(v.zoom);
  }

  /** Screen coordinates (clientX/clientY) to board coordinates. */
  toWorld(clientX: number, clientY: number): Point {
    const r = this.host.viewportEl.getBoundingClientRect();
    const v = this.host.board.view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }

  /** The board point at the middle of the visible area. */
  centerWorld(): Point {
    const r = this.host.viewportEl.getBoundingClientRect();
    return this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  resetZoom() {
    this.host.board.view.zoom = 1;
    this.apply();
    this.host.scheduleSave();
  }

  /** Mouse wheel zooms around the pointer. */
  bindWheel() {
    this.host.viewportEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const v = this.host.board.view;
        const r = this.host.viewportEl.getBoundingClientRect();
        const zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        v.x = mx - (mx - v.x) * (zoom / v.zoom);
        v.y = my - (my - v.y) * (zoom / v.zoom);
        v.zoom = zoom;
        this.apply();
        this.host.scheduleSave();
      },
      { passive: false }
    );
  }
}
