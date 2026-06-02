import { Board, findGroups } from "../board.ts";
import type { Point } from "../types.ts";

export function createsTetrisFourGroup(board: Board, pointsPlayed: Point[], color: number): boolean {
  return findGroups(board).some((group) =>
    group.color === color && group.points.length === 4 &&
    pointsPlayed.some((point) => group.points.some((groupPoint) => groupPoint.x === point.x && groupPoint.y === point.y))
  );
}
