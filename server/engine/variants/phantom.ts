import { Board, findGroups } from "../board.ts";
import type { Point, RuleMods, SharedState } from "../types.ts";

export function phantomOpponentCollisionIndexes(
  state: SharedState,
  board: Board,
  occupiedPoints: Point[],
  activeTeam: number,
  mods: RuleMods,
): number[] {
  if (!hasHiddenVisibility(mods)) return [];
  return occupiedPoints
    .map((point) => pointIndex(state, point))
    .filter((index) => {
      const owner = state.play.phantomOwners?.[index] ?? 0;
      return owner > 0 && owner !== activeTeam;
    });
}

export function revealAllPhantomStones(state: SharedState): void {
  state.play.phantomRevealed = Array(state.boardWidth * state.boardHeight).fill(true);
}

export function markPhantomPlaced(
  state: SharedState,
  points: Point[],
  team: number,
  mods: RuleMods,
): void {
  if (!mods.phantomMove) return;
  state.play.phantomOwners ??= Array(state.boardWidth * state.boardHeight).fill(0);
  state.play.phantomRevealed ??= Array(state.boardWidth * state.boardHeight).fill(false);
  for (const point of points) {
    const index = pointIndex(state, point);
    state.play.phantomOwners[index] = team;
    state.play.phantomRevealed[index] = false;
  }
}

export function revealPhantomPoints(state: SharedState, indexes: number[]): void {
  state.play.phantomRevealed ??= Array(state.boardWidth * state.boardHeight).fill(false);
  for (const index of indexes) state.play.phantomRevealed[index] = true;
}

export function revealAroundPhantomCaptures(
  state: SharedState,
  board: Board,
  capturedPoints: Point[],
): void {
  const indexes = new Set<number>();
  for (const point of capturedPoints) {
    indexes.add(pointIndex(state, point));
    for (const neighbor of board.neighbors(point)) indexes.add(pointIndex(state, neighbor));
  }
  revealPhantomPoints(state, [...indexes]);
}

export function revealPhantomAtariGroups(state: SharedState, board: Board, mods: RuleMods): void {
  if (!hasHiddenVisibility(mods)) return;
  const indexes = findGroups(board)
    .filter((group) => group.liberties === 1)
    .flatMap((group) => group.points.map((point) => pointIndex(state, point)));
  revealPhantomPoints(state, indexes);
}

function hasHiddenVisibility(mods: RuleMods): boolean {
  return Boolean(mods.phantomMove || mods.hiddenMove);
}

function pointIndex(state: SharedState, point: Point): number {
  return point.y * state.boardWidth + point.x;
}
