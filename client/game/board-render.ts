import { boardEdge, boardStep, isPlayableIntersection, starPointCoords } from "./board-utils.ts";
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
  const points = game.config.variants?.pixel
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
  if (game.config.variants?.pixel) {
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

function boardGridCoords(
  board: Element,
  game: Game,
  event: MouseEvent,
  showCoordinates = true,
): { gx: number; gy: number } {
  const rect = board.getBoundingClientRect();
  const px = ((event.clientX - rect.left) / rect.width) * 100;
  const py = ((event.clientY - rect.top) / rect.height) * 100;
  const edge = boardEdge(showCoordinates, game.boardWidth, game.boardHeight);
  return {
    gx: (px - edge) / boardStep(game.boardWidth, edge),
    gy: (py - edge) / boardStep(game.boardHeight, edge),
  };
}

export function boardGridHtml(game: Game, showCoordinates = true): string {
  const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
  const edge = boardEdge(showCoordinates, game.boardWidth, game.boardHeight);
  const stepX = boardStep(game.boardWidth, edge);
  const stepY = boardStep(game.boardHeight, edge);
  const lines: string[] = [];

  for (let y = 0; y < game.boardHeight; y++) {
    for (let x = 0; x < game.boardWidth; x++) {
      if (!isPlayableIntersection(game, x, y)) continue;
      const left = edge + x * stepX;
      const top = edge + y * stepY;
      if (isPlayableIntersection(game, x + 1, y)) {
        lines.push(
          `<i class="board-line board-line-h" style="left:${left}%;top:${top}%;inline-size:${stepX}%"></i>`,
        );
      }
      if (isPlayableIntersection(game, x, y + 1)) {
        lines.push(
          `<i class="board-line board-line-v" style="left:${left}%;top:${top}%;block-size:${stepY}%"></i>`,
        );
      }
    }
  }

  if (!showCoordinates) return lines.join("");

  const horizontalCoords = Array.from({ length: game.boardWidth }, (_, x) => {
    if (
      !Array.from({ length: game.boardHeight }, (_, y) => isPlayableIntersection(game, x, y)).some(
        Boolean,
      )
    ) return "";
    const left = edge + x * stepX;
    const label = letters[x] ?? x + 1;
    return `<span class="coord coord-top" style="left:${left}%">${label}</span>` +
      `<span class="coord coord-bottom" style="left:${left}%">${label}</span>`;
  }).join("");
  const verticalCoords = Array.from({ length: game.boardHeight }, (_, y) => {
    if (
      !Array.from({ length: game.boardWidth }, (_, x) => isPlayableIntersection(game, x, y)).some(
        Boolean,
      )
    ) return "";
    const top = edge + y * stepY;
    const label = game.boardHeight - y;
    return `<span class="coord coord-left" style="top:${top}%">${label}</span>` +
      `<span class="coord coord-right" style="top:${top}%">${label}</span>`;
  }).join("");
  return `${lines.join("")}${horizontalCoords}${verticalCoords}`;
}

export function starPointsHtml(game: Game, showCoordinates = true): string {
  const coords = starPointCoords(game.boardWidth, game.boardHeight)
    .filter(({ x, y }) => isPlayableIntersection(game, x, y));
  const edge = boardEdge(showCoordinates, game.boardWidth, game.boardHeight);
  return coords.map(({ x, y }) => {
    const left = edge + x * boardStep(game.boardWidth, edge);
    const top = edge + y * boardStep(game.boardHeight, edge);
    return `<i class="star-point" style="left:${left}%;top:${top}%"></i>`;
  }).join("");
}
