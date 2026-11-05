/** How the last move is marked on its stones, saved per browser like the sound settings. */
export type LastMoveMarker = "slice" | "circle" | "ring" | "square" | "triangle";

export const LAST_MOVE_MARKERS: readonly LastMoveMarker[] = [
  "slice",
  "circle",
  "ring",
  "square",
  "triangle",
];

const STORAGE_KEY = "baduk:last-move-marker";

export function parseLastMoveMarker(value: string | null | undefined): LastMoveMarker {
  return LAST_MOVE_MARKERS.find((marker) => marker === value) ?? "slice";
}

export function readLastMoveMarker(): LastMoveMarker {
  try {
    return parseLastMoveMarker(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "slice";
  }
}

export function saveLastMoveMarker(marker: LastMoveMarker): void {
  try {
    localStorage.setItem(STORAGE_KEY, marker);
  } catch {
    // The choice just won't persist (private window / blocked storage).
  }
}

/** The board CSS draws the marker from this attribute (see .is-last-move in board.css). */
export function applyLastMoveMarker(marker: LastMoveMarker, root = document.documentElement): void {
  root.dataset.lastMoveMarker = marker;
}
