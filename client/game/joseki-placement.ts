import type { Game, JosekiCard, JosekiSetup, JosekiStone } from "../types/domain.ts";

type JosekiPlacement = NonNullable<JosekiSetup["currentPlacement"]>;

type BoardOverlay = {
  colors: number[];
  opacity: number[];
};

export function josekiPlacementOverlay(
  game: Game,
  boardColors: number[],
  boardOpacity: number[] | undefined,
): BoardOverlay {
  const placement = game.josekiSetup?.currentPlacement;
  if (game.phase !== "joseki" || !placement) {
    return { colors: boardColors, opacity: boardOpacity ?? Array(boardColors.length).fill(1) };
  }
  const card = game.josekiSetup?.availableCards.find((card) => card.id === placement.cardId);
  if (!card) {
    return { colors: boardColors, opacity: boardOpacity ?? Array(boardColors.length).fill(1) };
  }
  return injectJosekiCard(
    boardColors,
    boardOpacity,
    game.boardWidth,
    game.boardHeight,
    card,
    placement,
  );
}

export function hoverJosekiCardOnBoard(board: Element, game: Game, cardId: string): void {
  clearJosekiCardHover(board);
  const card = game.josekiSetup?.availableCards.find((card) => card.id === cardId);
  if (!card) return;
  const placement: JosekiPlacement = {
    cardId,
    corner: "upper-right",
    rotate: 0,
    flipX: false,
    swapColors: false,
  };
  const overlay = injectJosekiCard(
    game.board,
    undefined,
    game.boardWidth,
    game.boardHeight,
    card,
    placement,
  );
  overlay.colors.forEach((color, index) => {
    if (color === game.board[index]) return;
    const point = board.querySelector<HTMLElement>(`.point[data-index='${index}']`);
    if (!point) return;
    point.dataset.josekiPreview = "true";
    point.dataset.originalColor = point.dataset.color ?? "0";
    point.dataset.originalOpacity = point.style.getPropertyValue("--stone-opacity");
    point.dataset.color = String(color);
    point.style.setProperty("--stone-opacity", "1");
  });
}

export function clearJosekiCardHover(board: Element | null | undefined): void {
  for (
    const point of board?.querySelectorAll<HTMLElement>(".point[data-joseki-preview='true']") ?? []
  ) {
    point.dataset.color = point.dataset.originalColor ?? "0";
    if (point.dataset.originalOpacity) {
      point.style.setProperty("--stone-opacity", point.dataset.originalOpacity);
    } else point.style.removeProperty("--stone-opacity");
    delete point.dataset.josekiPreview;
    delete point.dataset.originalColor;
    delete point.dataset.originalOpacity;
  }
}

function injectJosekiCard(
  sourceBoard: number[],
  sourceOpacity: number[] | undefined,
  width: number,
  height: number,
  card: JosekiCard,
  placement: JosekiPlacement,
): BoardOverlay {
  const board2d = toBoard2d(sourceBoard, width, height);
  const opacity2d = toBoard2d(sourceOpacity ?? Array(sourceBoard.length).fill(1), width, height);
  for (const stone of transformJosekiCard(card, placement)) {
    if (stone.x < 0 || stone.y < 0 || stone.x >= width || stone.y >= height) continue;
    if (board2d[stone.y][stone.x] !== 0) continue;
    board2d[stone.y][stone.x] = stone.color;
    opacity2d[stone.y][stone.x] = 0.55;
  }
  return { colors: board2d.flat(), opacity: opacity2d.flat() };
}

function toBoard2d<T>(values: T[], width: number, height: number): T[][] {
  return Array.from({ length: height }, (_, y) => values.slice(y * width, y * width + width));
}

function transformJosekiCard(card: JosekiCard, placement: JosekiPlacement): JosekiStone[] {
  const local = card.stones.map((stone) => ({
    ...stone,
    x: card.boardSize - 1 - stone.x,
    y: stone.y,
  }));
  const box = bounds(local);
  return local.map((stone) =>
    anchorLocalToCorner(
      {
        ...transformLocalStone(stone, placement, box.width, box.height),
        color: transformedColor(stone.color, placement),
      },
      card.boardSize,
      placement.corner,
    )
  );
}

function transformLocalStone(
  stone: JosekiStone,
  placement: JosekiPlacement,
  width: number,
  height: number,
): JosekiStone {
  let next = { ...stone };
  if (placement.flipX) next = { ...next, x: next.y, y: next.x };
  const rotate = placement.flipX ? 0 : placement.rotate ?? 0;
  if (rotate === 90) next = { ...next, x: next.y, y: width - 1 - next.x };
  else if (rotate === 180) next = { ...next, x: width - 1 - next.x, y: height - 1 - next.y };
  else if (rotate === 270) next = { ...next, x: height - 1 - next.y, y: next.x };
  return next;
}

function transformedColor(color: number, placement: JosekiPlacement): number {
  return placement.swapColors && (color === 1 || color === 2) ? (color === 1 ? 2 : 1) : color;
}

function anchorLocalToCorner(
  stone: JosekiStone,
  boardSize: number,
  corner: JosekiPlacement["corner"],
): JosekiStone {
  if (corner === "upper-left") return stone;
  if (corner === "upper-right") return { ...stone, x: boardSize - 1 - stone.x };
  if (corner === "lower-left") return { ...stone, y: boardSize - 1 - stone.y };
  return { ...stone, x: boardSize - 1 - stone.x, y: boardSize - 1 - stone.y };
}

function bounds(
  stones: JosekiStone[],
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (stones.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const xs = stones.map((stone) => stone.x);
  const ys = stones.map((stone) => stone.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
