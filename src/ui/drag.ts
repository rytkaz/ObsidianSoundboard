import type { BoardHost } from "./host";

/**
 * Tracks a pointer drag that started with `e`. Offsets are reported in board
 * units (screen pixels divided by zoom). The board is saved when the drag ends.
 */
export function dragPointer(
  host: BoardHost,
  e: PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd?: () => void
) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const zoom = host.board.view.zoom;
  const win = host.win;

  const move = (ev: PointerEvent) => onMove((ev.clientX - startX) / zoom, (ev.clientY - startY) / zoom);
  const up = () => {
    win.removeEventListener("pointermove", move);
    win.removeEventListener("pointerup", up);
    onEnd?.();
    host.scheduleSave();
  };
  win.addEventListener("pointermove", move);
  win.addEventListener("pointerup", up);
}
