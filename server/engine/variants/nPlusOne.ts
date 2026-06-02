import { Board } from "../board.ts";
import type { Point, RuleMods, SharedState } from "../types.ts";

export function shouldKeepTurn(
  _state: SharedState,
  board: Board,
  pointsPlayed: Point[],
  team: number,
  mods: RuleMods,
): boolean {
  if (!mods.nPlusOne) return false;

  const needed = Math.max(2, Math.trunc(mods.nPlusOneCount ?? 2));
  return pointsPlayed.some((point) => hasExactLine(board, point, team, needed));
}

function hasExactLine(board: Board, point: Point, team: number, needed: number): boolean {
  return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) =>
    1 + countDirection(board, point, team, dx, dy) + countDirection(board, point, team, -dx, -dy) === needed
  );
}

function countDirection(
  board: Board,
  point: Point,
  team: number,
  dx: number,
  dy: number,
): number {
  let count = 0;
  let current = { x: point.x + dx, y: point.y + dy };
  while (board.playable(current) && board.get(current) === team) {
    count++;
    current = { x: current.x + dx, y: current.y + dy };
  }
  return count;
}
