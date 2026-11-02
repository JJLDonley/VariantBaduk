import { escapeHtml } from "../ui/format.ts";
import { josekiCardBoardHtml } from "./joseki-card.ts";
import {
  currentShapeCardHasBothColors,
  isFullShapeMode,
  selectedShapeCardIndex,
  shapeOpponentTeam,
  shapeStoneColor,
  stampOrientation,
} from "./shape-card-state.ts";
import type { Game, HistoryEntry, Seat, Session, ShapeCard } from "../types/domain.ts";
import { readKatachiControls } from "./katachi-controls.ts";

/**
 * The hand column between the board and the info panel. Select a card (highlighted),
 * then click the board to play it stone by stone, or press Discard.
 */
export function shapeHandPanelHtml(
  game: Game,
  session: Session | undefined,
  viewingHistory = false,
  historyEntry?: HistoryEntry,
): string {
  const view = game.shapeCards;
  if (!view) return "";
  if (viewingHistory) return playedCardPanelHtml(game, historyEntry);
  const handSeat = shapeHandSeat(game, session);
  const turnSeat = game.seats[game.turn];
  const myTurn = !viewingHistory && game.phase === "play" && Boolean(handSeat) &&
    handSeat?.id === turnSeat?.id;
  const hand = handSeat ? view.hands[handSeat.id] ?? [] : [];
  const team = handSeat?.team ?? 1;
  const active = view.active;
  const activeCard = active ? view.cards[active.cardId] : undefined;
  const selectedIndex = myTurn ? selectedShapeCardIndex(game) : undefined;
  const selectedCard = selectedIndex !== undefined ? view.cards[hand[selectedIndex]] : undefined;
  const activeIndex = myTurn && active ? hand.indexOf(active.cardId) : -1;
  const canSelect = myTurn && !active;

  const status = handStatus(game, {
    myTurn,
    hasHand: Boolean(handSeat),
    activeCard,
    selectedCard,
  });
  const opponentActive = active && activeCard && !myTurn
    ? `<div class="shape-hand-playing">${
      shapeCardHtml(activeCard, ...teamsFor(game, seatTeam(game, active.seatId)), true)
    }</div>`
    : "";
  const grid = handSeat
    ? `<div class="shape-hand-grid">${
      hand.map((cardId, index) => {
        const card = view.cards[cardId];
        if (!card) return "";
        const selected = index === selectedIndex || index === activeIndex;
        // Full mode: the selected card shows the rotation/mirror it will be stamped in.
        const face = selected && isFullShapeMode(game)
          ? { ...card, stones: stampOrientation(card) }
          : card;
        return shapeCardHtml(face, ...teamsFor(game, team), selected, {
          index,
          disabled: !canSelect,
        });
      }).join("")
    }</div>`
    : "";

  return `
    <section class="shape-hand-panel ui-stack" aria-label="Katachi hand" data-shape-hand>
      <h3>${handSeat ? "Your hand" : "Katachi cards"}</h3>
      <p class="shape-hand-status" aria-live="polite">${status}</p>
      ${opponentActive}
      ${grid}
      ${myTurn ? handActionsHtml(game, Boolean(active), selectedCard !== undefined) : ""}
      ${handSeat ? ownDeckHtml(view, handSeat.id) : pilesHtml(game)}
    </section>
  `;
}

/** History review: the card this move came from, so everyone can see who played what. */
function playedCardPanelHtml(game: Game, entry: HistoryEntry | undefined): string {
  const played = entry?.shapeCard;
  const card = played ? game.shapeCards?.cards[played.cardId] : undefined;
  const body = played && card
    ? `<p class="shape-hand-status"><strong>${escapeHtml(seatName(game, played.seatId))}</strong> ${
      played.discarded
        ? `discarded <strong>${escapeHtml(card.name)}</strong>.`
        : played.stone === undefined
        ? `played <strong>${escapeHtml(card.name)}</strong>.`
        : `played <strong>${
          escapeHtml(card.name)
        }</strong> · stone ${played.stone} of ${played.total}.`
    }</p>
      <div class="shape-hand-playing">${
      shapeCardHtml(card, ...teamsFor(game, seatTeam(game, played.seatId)), true)
    }</div>`
    : `<p class="shape-hand-status">No card was played on this move.</p>`;
  return `
    <section class="shape-hand-panel ui-stack" aria-label="Played card" data-shape-hand>
      <h3>Played card</h3>
      ${body}
    </section>
  `;
}

/** Players only see how many cards are left in their own deck. */
function ownDeckHtml(view: NonNullable<Game["shapeCards"]>, seatId: string): string {
  const drawCount = view.seats.find((seat) => seat.seatId === seatId)?.drawCount ?? 0;
  return `<p class="muted-text">${drawCount} in deck</p>`;
}

/** Viewers (non-players) see every seat's hand size, deck size and last discard. */
function pilesHtml(game: Game): string {
  const view = game.shapeCards!;
  return `<ul class="shape-card-piles muted-text">${
    view.seats.map((seat) => {
      const lastDiscard = seat.discard.at(-1);
      return `<li><strong>${
        escapeHtml(seatName(game, seat.seatId))
      }</strong> · ${seat.handCount} in hand · ${seat.drawCount} in deck${
        lastDiscard
          ? ` · last discard: ${escapeHtml(view.cards[lastDiscard]?.name ?? lastDiscard)}`
          : ""
      }</li>`;
    }).join("")
  }</ul>`;
}

function handStatus(
  game: Game,
  state: { myTurn: boolean; hasHand: boolean; activeCard?: ShapeCard; selectedCard?: ShapeCard },
): string {
  const active = game.shapeCards?.active;
  if (game.phase === "joseki") return "Your cards are ready for when normal play begins.";
  if (game.phase !== "play") return "";
  if (state.myTurn && active && state.activeCard) {
    return `Placing <strong>${
      escapeHtml(state.activeCard.name)
    }</strong>: ${active.placed.length} / ${state.activeCard.stones.length} stones, in any order.`;
  }
  if (state.myTurn && state.selectedCard && isFullShapeMode(game)) {
    const controls = readKatachiControls();
    const place = controls.placeButton === "right" ? "Right-click" : "Left-click";
    const rotate = controls.placeButton === "right" ? "left-click" : "right-click";
    return `${place} to place <strong>${
      escapeHtml(state.selectedCard.name)
    }</strong>; ${rotate} or ${controls.rotateKey.toUpperCase()} rotates, ${controls.mirrorKey.toUpperCase()} mirrors.`;
  }
  if (state.myTurn && state.selectedCard) {
    return `Click the board to play <strong>${
      escapeHtml(state.selectedCard.name)
    }</strong>, or discard it.`;
  }
  if (state.myTurn) return "Your turn: select a card.";
  const name = escapeHtml(seatName(game, game.seats[game.turn]?.id ?? ""));
  if (active && state.activeCard) {
    return `${name} is playing <strong>${
      escapeHtml(state.activeCard.name)
    }</strong> (${active.placed.length} / ${state.activeCard.stones.length}).`;
  }
  return `${name}'s turn.`;
}

function handActionsHtml(game: Game, active: boolean, selected: boolean): string {
  if (!active && !selected) return "";
  const color = shapeStoneColor(game);
  const toggle = currentShapeCardHasBothColors(game)
    ? `<div class="actions shape-card-color" role="group" aria-label="Stone color">
        <button type="button" class="${
      color === "self" ? "is-active" : ""
    }" data-shape-color="self" aria-pressed="${color === "self"}">My stone</button>
        <button type="button" class="${
      color === "opponent" ? "is-active" : ""
    }" data-shape-color="opponent" aria-pressed="${color === "opponent"}">Opponent stone</button>
      </div>`
    : "";
  const placed = game.shapeCards?.active?.placed.length ?? 0;
  const buttons = active
    ? `<button type="button" data-shape-undo ${placed === 0 ? "disabled" : ""}>Undo stone</button>
       <button type="button" data-shape-cancel>Cancel card</button>`
    : isFullShapeMode(game)
    ? `<button type="button" data-shape-rotate aria-label="Rotate (R)">Rotate</button>
       <button type="button" data-shape-mirror aria-label="Mirror (F)">Mirror</button>
       <button type="button" data-shape-discard>Discard</button>`
    : `<button type="button" data-shape-discard>Discard</button>`;
  return `${toggle}<div class="actions shape-hand-actions">${buttons}</div>`;
}

export function shapeCardHtml(
  card: ShapeCard,
  team = 1,
  opponent = 2,
  selected = false,
  button?: { index: number; disabled: boolean },
): string {
  const stones = card.stones.map((stone) => ({
    x: stone.x,
    y: stone.y,
    color: stone.rel === "self" ? team : opponent,
  }));
  const bounds = shapeCardBounds(stones);
  const tag = button ? "button" : "span";
  const buttonAttrs = button
    ? ` type="button" data-shape-index="${button.index}" aria-pressed="${selected}"${
      button.disabled ? " disabled" : ""
    }`
    : "";
  return `
    <${tag} class="j-card shape-card ${selected ? "is-selected" : ""}" data-shape-card-id="${
    escapeHtml(card.id)
  }"${buttonAttrs}>
      <span class="shape-card__name">${escapeHtml(card.name)}</span>
      <span class="shape-card__frame">${josekiCardBoardHtml(stones, bounds)}</span>
      <span class="j-card__meta">${card.stones.length} stones</span>
    </${tag}>`;
}

const MIN_SHAPE_BOARD_LINES = 5;

/**
 * Card board bounds: the shape plus one empty line on every side, grown to at least
 * 5×5 lines, with the shape centered (any odd extra line goes after it).
 */
export function shapeCardBounds(stones: Array<{ x: number; y: number }>) {
  const axis = (values: number[]) => {
    const min = Math.min(...values);
    const span = Math.max(...values) - min + 1;
    const size = Math.max(MIN_SHAPE_BOARD_LINES, span + 2);
    return { start: min - Math.floor((size - span) / 2), size };
  };
  const x = axis(stones.map((stone) => stone.x));
  const y = axis(stones.map((stone) => stone.y));
  return { minX: x.start, minY: y.start, width: x.size, height: y.size };
}

/** The viewer's seat whose hand to show: the seat whose turn it is, else their first seat. */
export function shapeHandSeat(game: Game, session: Session | undefined): Seat | undefined {
  const hands = game.shapeCards?.hands ?? {};
  const owned = game.seats.filter((seat) =>
    seat.playerUuid && seat.playerUuid === session?.uuid && hands[seat.id]
  );
  return owned.find((seat) => seat.id === game.seats[game.turn]?.id) ?? owned[0];
}

function teamsFor(game: Game, team: number): [number, number] {
  return [team, shapeOpponentTeam(game, team)];
}

export function shapeCardGridHtml(cards: ShapeCard[]): string {
  return `<div class="j-card-grid">${
    cards.map((card) => `<div class="shape-card-slot">${shapeCardHtml(card)}</div>`).join("")
  }</div>`;
}

function seatTeam(game: Game, seatId: string): number {
  return game.seats.find((seat) => seat.id === seatId)?.team ?? 1;
}

function seatName(game: Game, seatId: string): string {
  const seat = game.seats.find((seat) => seat.id === seatId);
  return seat?.publicName || seat?.id || seatId;
}
