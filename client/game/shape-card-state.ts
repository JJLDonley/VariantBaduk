import type { Game, ShapeCard, ShapeStoneColor } from "../types/domain.ts";

// The game panel is rebuilt on every snapshot, so the selected card and the chosen
// stone color live here, outside the DOM.
let selection: { gameId: string; seatId: string; index: number; cardId: string } | undefined;
let selectedStoneColor: ShapeStoneColor = "self";
let colorCardKey = "";

/** The hand seat whose turn it is, if the viewer owns it (only owners receive hands). */
function turnHandSeatId(game: Game): string | undefined {
  const seatId = game.seats[game.turn]?.id;
  return seatId && game.shapeCards?.hands[seatId] ? seatId : undefined;
}

/** Hand index of the selected card, if the selection is still valid for this snapshot. */
export function selectedShapeCardIndex(game: Game): number | undefined {
  if (!selection || selection.gameId !== String(game.id)) return undefined;
  if (game.phase !== "play" || game.shapeCards?.active) return undefined;
  const seatId = turnHandSeatId(game);
  if (!seatId || seatId !== selection.seatId) return undefined;
  const hand = game.shapeCards?.hands[seatId] ?? [];
  if (hand[selection.index] === selection.cardId) return selection.index;
  const moved = hand.indexOf(selection.cardId);
  return moved >= 0 ? moved : undefined;
}

export function selectShapeCard(game: Game, index: number | undefined): void {
  const seatId = turnHandSeatId(game);
  const cardId = seatId !== undefined && index !== undefined
    ? game.shapeCards?.hands[seatId]?.[index]
    : undefined;
  selection = seatId && cardId && index !== undefined
    ? { gameId: String(game.id), seatId, index, cardId }
    : undefined;
  selectedStoneColor = "self";
  resetShapeStamp();
}

/** The card the next board click uses: the card in progress, else the selected one. */
export function currentShapeCard(game: Game): ShapeCard | undefined {
  const view = game.shapeCards;
  if (!view) return undefined;
  if (view.active) return view.cards[view.active.cardId];
  const index = selectedShapeCardIndex(game);
  const seatId = turnHandSeatId(game);
  const cardId = index !== undefined && seatId ? view.hands[seatId]?.[index] : undefined;
  return cardId ? view.cards[cardId] : undefined;
}

export function currentShapeCardHasBothColors(game: Game): boolean {
  const card = currentShapeCard(game);
  return Boolean(card && new Set(card.stones.map((stone) => stone.rel)).size > 1);
}

export function shapeStoneColor(game: Game): ShapeStoneColor {
  const card = currentShapeCard(game);
  if (!card) return "self";
  // Reset to "my stone" whenever a different card becomes current. Selecting a card
  // and then starting it on the board keeps the same key, so the choice carries over.
  const key = `${game.id}:${card.id}`;
  if (key !== colorCardKey) selectedStoneColor = "self";
  colorCardKey = key;
  if (!currentShapeCardHasBothColors(game)) return card.stones[0]?.rel ?? "self";
  return selectedStoneColor;
}

export function setShapeStoneColor(color: ShapeStoneColor): void {
  selectedStoneColor = color;
}

export function shapeOpponentTeam(game: Game, team: number): number {
  return game.seats.find((seat) => !seat.resigned && seat.team !== team)?.team ??
    (team === 1 ? 2 : 1);
}

/** Team whose color the next board click would place, when a shape card is in use. */
export function shapePreviewTeam(game: Game): number | undefined {
  if (!currentShapeCard(game)) return undefined;
  const team = game.seats[game.turn]?.team ?? 1;
  return shapeStoneColor(game) === "self" ? team : shapeOpponentTeam(game, team);
}

// --- Katachi "Full": the whole card is stamped onto the board at once. -------------
let stampRotation = 0;
let stampMirrored = false;

export function isFullShapeMode(game: Game): boolean {
  return Boolean(game.config.variants?.shapeCardFull);
}

export function rotateShapeStamp(): void {
  stampRotation = (stampRotation + 1) % 4;
}

export function mirrorShapeStamp(): void {
  stampMirrored = !stampMirrored;
}

export function resetShapeStamp(): void {
  stampRotation = 0;
  stampMirrored = false;
}

/** The card's stones in the current rotation/mirror, moved to a (0,0) top-left corner. */
export function stampOrientation(card: ShapeCard): ShapeCard["stones"] {
  let stones = card.stones.map((stone) => ({ ...stone, x: stampMirrored ? -stone.x : stone.x }));
  for (let turn = 0; turn < stampRotation; turn++) {
    stones = stones.map((stone) => ({ ...stone, x: -stone.y, y: stone.x }));
  }
  const minX = Math.min(...stones.map((stone) => stone.x));
  const minY = Math.min(...stones.map((stone) => stone.y));
  return stones.map((stone) => ({ ...stone, x: stone.x - minX, y: stone.y - minY }));
}

/** Board stones for the current card, centered on the hovered point. */
export function stampStonesAt(card: ShapeCard, point: { x: number; y: number }) {
  const stones = stampOrientation(card);
  const centerX = Math.floor(Math.max(...stones.map((stone) => stone.x)) / 2);
  const centerY = Math.floor(Math.max(...stones.map((stone) => stone.y)) / 2);
  return stones.map((stone) => ({
    x: point.x + stone.x - centerX,
    y: point.y + stone.y - centerY,
    rel: stone.rel,
  }));
}
