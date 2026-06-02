import { escapeHtml } from "../ui/format.ts";
import type { JosekiCard, JosekiStone } from "../types/domain.ts";

type JosekiCardPreviewBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type JosekiCardPreviewSize = {
  width: number;
  height: number;
};

export function josekiCardGridHtml(
  cards: JosekiCard[],
  selectedIds: Set<string> = new Set(),
): string {
  const previewSize = josekiCardGridPreviewSize(cards);
  return `<div class="j-card-grid">${
    cards.map((card) => josekiCardHtml(card, selectedIds.has(card.id), previewSize)).join("")
  }</div>`;
}

export function josekiCardHtml(
  card: JosekiCard,
  selected = false,
  previewSize: JosekiCardPreviewSize = josekiCardPreviewBounds(card.stones, card.boardSize),
): string {
  const bounds = josekiCardTopRightBounds(card.stones, previewSize, card.boardSize);
  return `
    <button class="j-card ${
    selected ? "is-selected" : ""
  }" type="button" data-joseki-card-id="${card.id}">
      <span>${escapeHtml(card.name)}</span>
      ${josekiCardBoardHtml(card.stones, bounds)}
      <span class="j-card__meta">${card.stones.length} stones · ${bounds.width}×${bounds.height} preview</span>
    </button>
  `;
}

export function josekiCardBoardHtml(
  stones: JosekiStone[],
  bounds = josekiCardPreviewBounds(stones),
): string {
  return `
    <span class="j-card__board" aria-hidden="true" style="--j-card-board-width: ${bounds.width}; --j-card-board-height: ${bounds.height}">
      ${josekiCardLineHtml(bounds)}
      ${stones.map((stone) => josekiCardStoneHtml(stone, bounds)).join("")}
    </span>
  `;
}

export function josekiCardGridPreviewSize(cards: JosekiCard[]): JosekiCardPreviewSize {
  const bounds = cards.map((card) => josekiCardPreviewBounds(card.stones, card.boardSize));
  return {
    width: Math.max(1, ...bounds.map((bound) => bound.width)),
    height: Math.max(1, ...bounds.map((bound) => bound.height)),
  };
}

export function josekiCardTopRightBounds(
  stones: JosekiStone[],
  previewSize: JosekiCardPreviewSize,
  boardSize = 19,
): JosekiCardPreviewBounds {
  if (stones.length === 0) {
    return { minX: Math.max(0, boardSize - previewSize.width), minY: 0, ...previewSize };
  }
  return {
    minX: Math.max(0, boardSize - previewSize.width),
    minY: 0,
    ...previewSize,
  };
}

export function josekiCardPreviewBounds(
  stones: JosekiStone[],
  boardSize = 19,
): JosekiCardPreviewBounds {
  if (stones.length === 0) {
    return { minX: Math.max(0, boardSize - 1), minY: 0, width: 1, height: 1 };
  }
  const xs = stones.map((stone) => stone.x);
  const ys = stones.map((stone) => stone.y);
  const minX = Math.max(0, Math.min(...xs) - 1);
  const minY = 0;
  const maxX = boardSize - 1;
  const maxY = Math.min(boardSize - 1, Math.max(...ys) + 1);
  return {
    minX,
    minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function josekiCardLineHtml(bounds: JosekiCardPreviewBounds): string {
  const vertical = Array.from(
    { length: Math.max(0, bounds.width) },
    (_, x) =>
      `<span class="j-card__line j-card__line--vertical" style="--j-card-x: ${
        linePosition(x, bounds.width)
      }"></span>`,
  );
  const horizontal = Array.from(
    { length: Math.max(0, bounds.height) },
    (_, y) =>
      `<span class="j-card__line j-card__line--horizontal" style="--j-card-y: ${
        linePosition(y, bounds.height)
      }"></span>`,
  );
  return `${vertical.join("")}${horizontal.join("")}`;
}

function josekiCardStoneHtml(stone: JosekiStone, bounds: JosekiCardPreviewBounds): string {
  return `<span class="j-card__stone" data-color="${stone.color}" style="--j-card-x: ${
    linePosition(stone.x - bounds.minX, bounds.width)
  }; --j-card-y: ${linePosition(stone.y - bounds.minY, bounds.height)}"></span>`;
}

function linePosition(index: number, lineCount: number): number {
  return index / Math.max(1, lineCount - 1);
}
