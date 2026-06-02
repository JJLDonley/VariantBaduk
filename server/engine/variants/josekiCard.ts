import type { Color, Point } from "../types.ts";

export type JosekiStone = Point & {
  color: Color;
};

export type JosekiCard = {
  id: string;
  name: string;
  boardSize: number;
  stones: JosekiStone[];
};

export type JosekiTransform = {
  corner: "upper-left" | "upper-right" | "lower-left" | "lower-right";
  rotate?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  swapColors?: boolean;
  colorMap?: Record<number, number>;
};

export function transformJosekiCard(card: JosekiCard, transform: JosekiTransform): JosekiStone[] {
  const local = card.stones.map((stone) => ({
    ...stone,
    x: card.boardSize - 1 - stone.x,
    y: stone.y,
  }));
  const box = bounds(local);
  return local.map((stone) =>
    anchorLocalToCorner(
      {
        ...transformLocalStone(stone, transform, box.width, box.height),
        color: transformedColor(stone.color, transform),
      },
      card.boardSize,
      transform.corner,
    )
  );
}

export function josekiBounds(
  card: JosekiCard,
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  return bounds(card.stones);
}

function transformLocalStone(
  stone: JosekiStone,
  transform: JosekiTransform,
  width: number,
  height: number,
): JosekiStone {
  let next = { ...stone };
  if (transform.flipX) next = { ...next, x: next.y, y: next.x };
  if (transform.flipY) next = { ...next, y: height - 1 - next.y };
  const rotate = transform.flipX ? 0 : transform.rotate ?? 0;
  if (rotate === 90) next = { ...next, x: next.y, y: width - 1 - next.x };
  else if (rotate === 180) next = { ...next, x: width - 1 - next.x, y: height - 1 - next.y };
  else if (rotate === 270) next = { ...next, x: height - 1 - next.y, y: next.x };
  return next;
}

function transformedColor(color: Color, transform: JosekiTransform): Color {
  const swapped = transform.swapColors && (color === 1 || color === 2)
    ? (color === 1 ? 2 : 1)
    : color;
  return transform.colorMap?.[swapped] ?? swapped;
}

function anchorLocalToCorner(
  stone: JosekiStone,
  boardSize: number,
  corner: JosekiTransform["corner"],
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
