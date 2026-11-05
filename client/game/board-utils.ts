/** What board geometry needs: a game, or a custom board being edited. */
export type BoardLike = {
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

/**
 * Where a board's lines sit inside the board element, in percent of its width and height.
 *
 * Lines are the same distance apart horizontally and vertically: the element takes
 * `aspectRatio`, so non-square boards aren't stretched. With `trim`, outer rows and columns that
 * are entirely water (custom boards) are left out of the frame; spacing is unchanged.
 */
export type BoardFrame = {
  /** First shown column and row, and how many are shown. */
  firstX: number;
  firstY: number;
  columns: number;
  rows: number;
  /** Distance between neighbouring lines, in % of the element's width / height. */
  stepX: number;
  stepY: number;
  /** Distance from the element's edge to the first shown line, in % of its width / height. */
  edgeX: number;
  edgeY: number;
  /** Element width / height. */
  aspectRatio: number;
};

export function boardFrame(game: BoardLike, showCoordinates: boolean, trim = true): BoardFrame {
  const width = game.boardWidth;
  const height = game.boardHeight;
  let firstX = 0;
  let firstY = 0;
  let lastX = width - 1;
  let lastY = height - 1;
  if (trim) {
    const playable = game.board.flatMap((point, index) => point === -1 ? [] : [index]);
    if (playable.length) {
      const xs = playable.map((index) => index % width);
      const ys = playable.map((index) => Math.floor(index / width));
      [firstX, lastX, firstY, lastY] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
      ];
    }
  }
  const columns = lastX - firstX + 1;
  const rows = lastY - firstY + 1;
  // The margin around the outer lines, in line spacings, is what a square board of the longer
  // side has, so standard square boards render exactly as before.
  const side = Math.max(2, columns, rows);
  const edge = boardEdge(showCoordinates, side, side);
  const margin = edge / boardStep(side, edge);
  const spanX = columns - 1 + 2 * margin;
  const spanY = rows - 1 + 2 * margin;
  return {
    firstX,
    firstY,
    columns,
    rows,
    stepX: 100 / spanX,
    stepY: 100 / spanY,
    edgeX: (margin * 100) / spanX,
    edgeY: (margin * 100) / spanY,
    aspectRatio: spanX / spanY,
  };
}

/** A line crossing's position in the frame, in % of the element's width and height. */
export function framePosition(
  frame: BoardFrame,
  x: number,
  y: number,
): { left: number; top: number } {
  return {
    left: frame.edgeX + (x - frame.firstX) * frame.stepX,
    top: frame.edgeY + (y - frame.firstY) * frame.stepY,
  };
}

/** The (fractional) board column and row under a position given in % of the element. */
export function frameGridCoords(
  frame: BoardFrame,
  leftPercent: number,
  topPercent: number,
): { gx: number; gy: number } {
  return {
    gx: (leftPercent - frame.edgeX) / frame.stepX + frame.firstX,
    gy: (topPercent - frame.edgeY) / frame.stepY + frame.firstY,
  };
}

export function pointPosition(
  game: BoardLike,
  index: number,
  frame = boardFrame(game, true),
): { left: number; top: number } {
  return framePosition(frame, index % game.boardWidth, Math.floor(index / game.boardWidth));
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
