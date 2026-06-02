import { Board, findGroups } from "./board.ts";
import type { Point, SharedState } from "./types.ts";

export type CapturedGroup = {
  points: Point[];
};

export function captureDeadOpponents(board: Board, color: number): CapturedGroup[] {
  const capturedGroups: CapturedGroup[] = [];
  for (const group of findGroups(board)) {
    if (group.color === color || group.liberties > 0) continue;
    const points = group.points.map((point) => ({ ...point }));
    for (const point of group.points) board.set(point, 0);
    capturedGroups.push({ points });
  }
  return capturedGroups;
}

export function violatesSuperko(
  state: SharedState,
  board: Board,
  hash: string,
  captures: number,
): boolean {
  if (captures === 0) return false;
  for (const history of state.history) {
    if (history.hash === hash && Board.from(state.boardWidth, state.boardHeight, history.board).equals(board)) {
      return true;
    }
  }
  return false;
}
