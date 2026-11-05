import {
  type BoardFrame,
  boardFrame,
  type BoardLike,
  frameGridCoords,
  framePosition,
  isPlayableIntersection,
  starPointCoords,
} from "./board-utils.ts";
import type { Game } from "../types/domain.ts";

export function setBoardPreview(
  board: Element,
  game: Game,
  event: MouseEvent,
  showCoordinates = true,
): void {
  const indexes = previewBoardIndexes(board, game, event, showCoordinates);
  clearBoardPreview(board);
  for (const index of indexes) {
    board.querySelector(`.point[data-index='${index}']`)?.classList.add("is-preview");
  }
}

export function clearBoardPreview(board: Element | null | undefined): void {
  for (const point of board?.querySelectorAll(".point.is-preview") ?? []) {
    point.classList.remove("is-preview");
  }
}

export function previewBoardIndexes(
  board: Element,
  game: Game,
  event: MouseEvent,
  showCoordinates = true,
): number[] {
  const point = placementPointFromEvent(board, game, event, showCoordinates);
  if (!point) return [];
  const points = shouldUsePixelPlacement(game)
    ? [point, { x: point.x + 1, y: point.y }, { x: point.x, y: point.y + 1 }, {
      x: point.x + 1,
      y: point.y + 1,
    }]
    : [point];
  return points
    .filter((point) =>
      point.x >= 0 && point.y >= 0 && point.x < game.boardWidth && point.y < game.boardHeight
    )
    .map((point) => point.y * game.boardWidth + point.x)
    .filter((candidate) => game.board[candidate] === 0);
}

export function placementPointFromEvent(
  board: Element,
  game: Game,
  event: MouseEvent,
  showCoordinates = true,
): { x: number; y: number } | undefined {
  const { gx, gy } = boardGridCoords(board, game, event, showCoordinates);
  if (shouldUsePixelPlacement(game)) {
    const point = { x: Math.floor(gx), y: Math.floor(gy) };
    const hasBoardPoint = [
      point,
      { x: point.x + 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x + 1, y: point.y + 1 },
    ].some((candidate) =>
      candidate.x >= 0 && candidate.y >= 0 &&
      candidate.x < game.boardWidth && candidate.y < game.boardHeight &&
      game.board[candidate.y * game.boardWidth + candidate.x] !== -1
    );
    return hasBoardPoint ? point : undefined;
  }

  const point = { x: Math.round(gx), y: Math.round(gy) };
  if (point.x < 0 || point.y < 0 || point.x >= game.boardWidth || point.y >= game.boardHeight) {
    return undefined;
  }
  if (game.board[point.y * game.boardWidth + point.x] === -1) return undefined;
  return point;
}

function shouldUsePixelPlacement(game: Game): boolean {
  return Boolean(game.config.variants?.pixel && game.phase !== "scoring");
}

function boardGridCoords(
  board: Element,
  game: Game,
  event: MouseEvent,
  showCoordinates = true,
): { gx: number; gy: number } {
  const rect = board.getBoundingClientRect();
  return frameGridCoords(
    boardFrame(game, showCoordinates),
    ((event.clientX - rect.left) / rect.width) * 100,
    ((event.clientY - rect.top) / rect.height) * 100,
  );
}

export function boardGridHtml(
  game: BoardLike,
  showCoordinates = true,
  frame: BoardFrame = boardFrame(game, showCoordinates),
): string {
  const segments: string[] = [];

  for (let y = 0; y < game.boardHeight; y++) {
    for (let x = 0; x < game.boardWidth; x++) {
      if (!isPlayableIntersection(game, x, y)) continue;
      const { left, top } = framePosition(frame, x, y);
      if (isPlayableIntersection(game, x + 1, y)) {
        const right = framePosition(frame, x + 1, y).left;
        segments.push(`M${svgNumber(left)} ${svgNumber(top)}H${svgNumber(right)}`);
      }
      if (isPlayableIntersection(game, x, y + 1)) {
        const bottom = framePosition(frame, x, y + 1).top;
        segments.push(`M${svgNumber(left)} ${svgNumber(top)}V${svgNumber(bottom)}`);
      }
    }
  }
  const grid = boardGridSvg(segments);

  if (!showCoordinates) return grid;

  const horizontalCoords = Array.from({ length: game.boardWidth }, (_, x) => {
    if (
      !Array.from({ length: game.boardHeight }, (_, y) => isPlayableIntersection(game, x, y)).some(
        Boolean,
      )
    ) return "";
    const left = framePosition(frame, x, 0).left;
    const label = columnLabel(x);
    return `<span class="coord coord-top" style="left:${left}%">${label}</span>` +
      `<span class="coord coord-bottom" style="left:${left}%">${label}</span>`;
  }).join("");
  const verticalCoords = Array.from({ length: game.boardHeight }, (_, y) => {
    if (
      !Array.from({ length: game.boardWidth }, (_, x) => isPlayableIntersection(game, x, y)).some(
        Boolean,
      )
    ) return "";
    const top = framePosition(frame, 0, y).top;
    const label = game.boardHeight - y;
    return `<span class="coord coord-left" style="top:${top}%">${label}</span>` +
      `<span class="coord coord-right" style="top:${top}%">${label}</span>`;
  }).join("");
  return `${grid}${horizontalCoords}${verticalCoords}`;
}

/**
 * Land for boards with water: one SVG path of a square per playable point (one grid step wide),
 * drawn over a soft water background so islands stand out. Empty for boards without water, which
 * keep their plain wooden look. Squares overlap a hair so no seams show between neighbours.
 */
export function boardLandHtml(
  game: BoardLike,
  frame: BoardFrame = boardFrame(game, true),
): string {
  if (!game.board.includes(-1)) return "";
  const halfX = frame.stepX / 2 + frame.stepX * 0.02;
  const halfY = frame.stepY / 2 + frame.stepY * 0.02;
  const squares = game.board.flatMap((point, index) => {
    if (point === -1) return [];
    const { left, top } = framePosition(
      frame,
      index % game.boardWidth,
      Math.floor(index / game.boardWidth),
    );
    return [
      `M${svgNumber(left - halfX)} ${svgNumber(top - halfY)}h${svgNumber(halfX * 2)}` +
      `v${svgNumber(halfY * 2)}h${svgNumber(-halfX * 2)}z`,
    ];
  });
  return `<svg class="board-land" viewBox="0 0 100 100" preserveAspectRatio="none" ` +
    `aria-hidden="true" focusable="false"><path d="${squares.join("")}"/></svg>`;
}

/** Go column letters skip "I" (it looks like "J"/"1"). */
const COLUMN_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

/** Column label: A–Z, then doubled AA–ZZ, then AAA–ZZZ, and so on for wide custom boards. */
export function columnLabel(x: number): string {
  const letter = COLUMN_LETTERS[x % COLUMN_LETTERS.length];
  return letter.repeat(Math.floor(x / COLUMN_LETTERS.length) + 1);
}

/**
 * The grid as one SVG path in board percentages (viewBox 0..100, stretched over the board).
 * Separate 1px boxes at fractional positions were each rounded to device pixels differently, so
 * some lines looked thicker or thinner than others, especially at 125%/150%/2.625x scaling.
 * crispEdges snaps every line the same way and non-scaling-stroke keeps them 1 CSS px wide.
 * The stroke color comes from CSS (.board-grid), so each page can theme it.
 */
function boardGridSvg(segments: string[]): string {
  return `<svg class="board-grid" viewBox="0 0 100 100" preserveAspectRatio="none" ` +
    `aria-hidden="true" focusable="false"><path d="${segments.join("")}" fill="none" ` +
    `stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/></svg>`;
}

/**
 * Grid line width in CSS px that is a whole number of device pixels. With crispEdges, a width
 * like 1 CSS px = 1.25 or 2.625 device px is rounded per line (1 or 2, 2 or 3 pixels), which is
 * exactly the "some lines thicker" effect; a whole number of device pixels rounds the same
 * everywhere.
 */
export function gridStrokeWidth(devicePixelRatio: number): string {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const devicePixels = Math.max(1, Math.round(ratio));
  return `${Number((devicePixels / ratio).toFixed(4))}px`;
}

/** Keeps --grid-stroke in sync with the screen's pixel density (zoom, moving monitors). */
export function keepGridLinesCrisp(root: HTMLElement = document.documentElement): void {
  const update = () => {
    root.style.setProperty("--grid-stroke", gridStrokeWidth(devicePixelRatio));
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
      .addEventListener("change", update, { once: true });
  };
  update();
}

function svgNumber(value: number): number {
  return Number(value.toFixed(4));
}

export function starPointsHtml(
  game: BoardLike,
  showCoordinates = true,
  frame: BoardFrame = boardFrame(game, showCoordinates),
): string {
  const coords = starPointCoords(game)
    .filter(({ x, y }) => isPlayableIntersection(game, x, y));
  return coords.map(({ x, y }) => {
    const { left, top } = framePosition(frame, x, y);
    return `<i class="star-point" style="left:${left}%;top:${top}%"></i>`;
  }).join("");
}
