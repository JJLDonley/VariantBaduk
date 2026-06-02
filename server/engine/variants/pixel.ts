import { Board } from "../board.ts";
import type { Point, RuleMods } from "../types.ts";

export function placementPoints(board: Board, point: Point, mods: RuleMods): Point[] {
  if (!mods.pixel) return board.playable(point) ? [point] : [];
  return [
    point,
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x + 1, y: point.y + 1 },
  ].filter((candidate) => board.playable(candidate));
}
