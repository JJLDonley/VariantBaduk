type BoardLike = {
  boardWidth: number;
  boardHeight: number;
  board: number[];
  config?: {
    customGoban?: {
      starPoints?: Array<{ x: number; y: number }>;
    };
  };
};

export function neighborIndexes(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors: number[] = [];
  if (x > 0) neighbors.push(index - 1);
  if (x < width - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);
  return neighbors;
}

export function isPlayableIntersection(game: BoardLike, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < game.boardWidth && y < game.boardHeight &&
    game.board[y * game.boardWidth + x] !== -1;
}

export function starPointCoords(game: BoardLike): Array<{ x: number; y: number }> {
  const customStarPoints = game.config?.customGoban?.starPoints;
  if (customStarPoints?.length) {
    return customStarPoints.filter(({ x, y }) => isPlayableIntersection(game, x, y));
  }
  const { boardWidth: width, boardHeight: height } = game;
  if (width !== height) return [];
  if (width === 9) {
    return [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 6 }, { x: 6, y: 6 }];
  }
  if (width === 13) return starGrid([3, 6, 9]);
  if (width === 19) return starGrid([3, 9, 15]);
  return [];
}

export function pointPosition(
  game: BoardLike,
  index: number,
  edge = boardEdge(true, game.boardWidth, game.boardHeight),
): { left: number; top: number } {
  const x = index % game.boardWidth;
  const y = Math.floor(index / game.boardWidth);
  return {
    left: edge + x * boardStep(game.boardWidth, edge),
    top: edge + y * boardStep(game.boardHeight, edge),
  };
}

export function boardEdge(showCoordinates: boolean, width = 19, height = width): number {
  const stoneSafeEdge = 50 / Math.max(1, Math.min(width, height));
  return showCoordinates ? Math.max(7, stoneSafeEdge + 4) : Math.max(3, stoneSafeEdge);
}

export function boardStep(size: number, edge = boardEdge(true, size)): number {
  return size <= 1 ? 0 : (100 - edge * 2) / (size - 1);
}

export function pointLabel(game: BoardLike, index: number): string {
  const x = index % game.boardWidth;
  const y = Math.floor(index / game.boardWidth);
  return `point ${x + 1}, ${y + 1}`;
}

function starGrid(values: number[]): Array<{ x: number; y: number }> {
  return values.flatMap((y) => values.map((x) => ({ x, y })));
}
