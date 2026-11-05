import type { Game, HistoryEntry } from "../types/domain.ts";

/** One stone to slide on screen, by board index. */
export type MagnetSlide = { from: number; to: number; distance: number; attracted: boolean };

/**
 * Slides to animate for a newly arrived Magnetic Go move. Only for a fresh move in the game being
 * watched (not on reconnects or undo); history review uses reviewMagnetSlides.
 */
export function magnetSlides(
  previous: Game | undefined,
  next: Game,
  viewingHistory: boolean,
): MagnetSlide[] {
  if (!previous || String(previous.id) !== String(next.id) || viewingHistory) return [];
  if ((next.playMoves ?? 0) <= (previous.playMoves ?? 0)) return [];
  return slidesOf(next, next);
}

/** Slides of the reviewed position's move, replayed when history navigation lands on it. */
export function reviewMagnetSlides(game: Game, entry: HistoryEntry | undefined): MagnetSlide[] {
  return entry?.board ? slidesOf({ ...entry, board: entry.board }, game) : [];
}

/**
 * Only stones still on the board afterwards are animated (a stone captured right after sliding
 * just disappears). Pulled stones are the ones colored differently from the played stone.
 */
function slidesOf(
  position: Pick<Game, "board" | "lastStone" | "magnetMoves">,
  game: Pick<Game, "boardWidth">,
): MagnetSlide[] {
  const width = game.boardWidth;
  const placed = position.lastStone?.[0];
  const placedColor = placed ? position.board[placed.y * width + placed.x] : undefined;
  return (position.magnetMoves ?? []).flatMap(({ from, to }) => {
    const toIndex = to.y * width + to.x;
    const color = position.board[toIndex];
    if (!color || color < 0) return [];
    return [{
      from: from.y * width + from.x,
      to: toIndex,
      distance: Math.abs(from.x - to.x) + Math.abs(from.y - to.y),
      attracted: color !== placedColor,
    }];
  });
}

/**
 * Plays the slides on the rendered board. The stones are already drawn at their new points; each
 * starts offset back at its old point and glides in. Pulled stones speed up as they snap in;
 * pushed stones slow down as they come to rest.
 */
export function animateMagnetSlides(root: ParentNode, slides: MagnetSlide[]): void {
  if (slides.length === 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const slide of slides) {
    const stone = root.querySelector<HTMLElement>(`.point[data-index="${slide.to}"]`);
    const origin = root.querySelector<HTMLElement>(`.point[data-index="${slide.from}"]`);
    if (!stone || !origin || typeof stone.animate !== "function") continue;
    const end = stone.getBoundingClientRect();
    const start = origin.getBoundingClientRect();
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    stone.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], {
      duration: Math.min(450, 140 + slide.distance * 45),
      easing: slide.attracted ? "cubic-bezier(0.5, 0, 0.9, 0.6)" : "cubic-bezier(0.1, 0.6, 0.3, 1)",
    });
  }
}
