import { escapeHtml } from "../ui/format.ts";
import { boardGridHtml, starPointsHtml } from "./board-render.ts";
import { boardEdge, boardStep, pointLabel, pointPosition } from "./board-utils.ts";
import {
  gameInfoHtml,
  placementPreviewTeam,
  scoringHelpHtml,
  stoneColor,
  viewersHtml,
} from "./display.ts";
import { teamSeatsHtml } from "./seats-render.ts";
import { territoryShadeHtml } from "./territory.ts";
import { variantRulesHelpHtml } from "./variants.ts";
import { josekiPlacementOverlay } from "./joseki-placement.ts";
import { josekiCardGridHtml } from "./joseki-card.ts";
import type { Game, Session } from "../types/domain.ts";

type GameViewContext = {
  game: Game;
  session: Session | undefined;
  boardColors: number[];
  boardOpacity?: number[];
  canNavigateHistory: boolean;
  visualHistoryIndex: number;
  playableHistoryIndex: number;
  playableHistoryCount: number;
  viewingHistory: boolean;
  passOrDoneDisabled: boolean;
  canUsePlayActions: boolean;
  canUndo: boolean;
  canResign: boolean;
  showCoordinates: boolean;
};

export function gameViewHtml(context: GameViewContext): string {
  const {
    game,
    session,
    boardColors,
    boardOpacity,
    canNavigateHistory,
    visualHistoryIndex,
    playableHistoryIndex,
    playableHistoryCount,
    viewingHistory,
    passOrDoneDisabled,
    canUsePlayActions,
    canUndo,
    canResign,
    showCoordinates,
  } = context;
  const edge = boardEdge(showCoordinates, game.boardWidth, game.boardHeight);
  const overlay = josekiPlacementOverlay(game, boardColors, boardOpacity);
  return `
    <div class="game-title-row">
      <h2>${escapeHtml(game.config.name || `Game #${game.id}`)}</h2>
      <div class="game-title-actions ui-cluster">
        <button class="game-info-toggle" type="button" aria-label="Show game info">?</button>
      </div>
    </div>
    <dialog class="ui-dialog game-info-dialog">
      <button class="dialog-close" type="button" aria-label="Close">×</button>
      ${gameInfoHtml(game)}
      ${variantRulesHelpHtml(game)}
      ${scoringHelpHtml()}
    </dialog>
    <div class="game-view">
      <section class="board-panel" aria-label="Board">
        <div class="board" data-preview-team="${
    placementPreviewTeam(game)
  }" data-coordinates="${showCoordinates}" style="--board-step: ${
    boardStep(game.boardWidth, edge)
  }%; --preview-color: ${stoneColor(game, placementPreviewTeam(game))}">
          ${boardGridHtml(game, showCoordinates)}
          ${starPointsHtml(game, showCoordinates)}
          ${territoryShadeHtml(game, overlay.colors, edge)}
          ${boardPointsHtml(game, overlay.colors, overlay.opacity, edge)}
        </div>
      </section>
      <section class="players-panel ui-stack" aria-label="Players and seats">
        <button class="players-toggle players-panel__toggle" type="button" aria-expanded="false">Players</button>
        <div class="history-actions players-panel__review" ${canNavigateHistory ? "" : "hidden"}>
          <button class="history-edge" data-history="first" ${
    visualHistoryIndex <= 0 ? "disabled" : ""
  }>First</button>
          <button data-history="prev" ${
    visualHistoryIndex <= 0 ? "disabled" : ""
  } aria-label="Previous">←</button>
          <span>${playableHistoryIndex} / ${playableHistoryCount}</span>
          <button data-history="next" ${
    !viewingHistory ? "disabled" : ""
  } aria-label="Next">→</button>
          <button class="history-edge" data-history="latest" ${
    !viewingHistory ? "disabled" : ""
  }>Last</button>
        </div>
        ${josekiSetupHtml(game, session)}
        ${hiddenSetupHtml(game, session)}
        <div class="seats players-panel__seats" hidden>
          ${teamSeatsHtml(game, session)}
        </div>
        <div class="actions players-panel__actions" ${
    game.phase === "done" || game.phase === "hidden" || viewingHistory ||
      !game.seats.every((seat) => seat.playerUuid) ||
      (game.phase === "scoring" ? passOrDoneDisabled : !canUsePlayActions)
      ? "hidden"
      : ""
  }>
          <button data-action="${game.phase === "scoring" ? "acceptScore" : "pass"}" ${
    passOrDoneDisabled ? "disabled" : ""
  }>${game.phase === "scoring" ? "Done" : "Pass"}</button>
          <button data-action="cancel" ${!canUndo ? "disabled" : ""}>Undo</button>
          <button data-action="resign" ${!canResign ? "disabled" : ""}>Resign</button>
        </div>
        <div class="players-panel__metadata">${gameInfoHtml(game)}</div>
      </section>
      <div class="panel-divider" aria-hidden="true"></div>
      <section class="users-panel ui-stack" aria-label="Users">
        <h3>Users</h3>
        <div class="user-list">
          <h4>Users</h4>
          ${viewersHtml(game)}
        </div>
      </section>
    </div>
  `;
}

function hiddenSetupHtml(game: Game, session: Session | undefined): string {
  const setup = game.hiddenSetup;
  if (game.phase !== "hidden" || !setup) return "";
  const ownedSeatIds = new Set(
    game.seats.filter((seat) => seat.playerUuid === session?.uuid).map((seat) => seat.id),
  );
  const owned = setup.seats.filter((entry) => ownedSeatIds.has(entry.seatId));
  const placed = owned.reduce(
    (total, entry) => total + (entry.placements?.length ?? entry.points.length),
    0,
  );
  const required = owned.length * setup.stonesPerPlayer;
  return `
    <div class="joseki-setup-panel players-panel__actions">
      <strong>Hidden setup</strong>
      <p class="muted-text">Place ${setup.stonesPerPlayer} hidden stones per seat before play starts.</p>
      <p>${placed} / ${required} placed</p>
    </div>
  `;
}

function josekiSetupHtml(game: Game, session: Session | undefined): string {
  const setup = game.josekiSetup;
  if (game.phase !== "joseki" || !setup) return "";
  const seat = game.seats.find((seat) => seat.playerUuid === session?.uuid);
  const ownedSeatIds = new Set(
    game.seats.filter((seat) => seat.playerUuid === session?.uuid).map((seat) => seat.id),
  );
  const ownedSetups = setup.seats.filter((entry) => ownedSeatIds.has(entry.seatId));
  if (setup.phase === "select") {
    const selected = new Set(ownedSetups.flatMap((entry) => entry.selectedCardIds));
    const requiredCount = Math.max(2, ownedSetups.length * 2);
    const seconds = Math.max(0, Math.ceil((setup.selectionDeadlineAt - Date.now()) / 1000));
    const canSelect = ownedSetups.length > 0;
    const pickText = requiredCount === 2
      ? "Pick 2 joseki cards"
      : `Pick ${requiredCount} joseki cards`;
    return `
      <div class="joseki-selection-notice players-panel__setup">
        <strong>${canSelect ? pickText : "Joseki card selection"}</strong>
        <p class="muted-text">${
      canSelect
        ? `${pickText} before play starts. Selection closes in ${seconds}s.`
        : `Waiting for players to pick joseki cards. Selection closes in ${seconds}s.`
    }</p>
        <p>${selected.size} / ${requiredCount} selected</p>
        <button data-joseki-selection-open type="button" ${
      canSelect ? "" : "disabled"
    }>Choose cards</button>
      </div>
      <dialog class="ui-dialog ui-scroll joseki-selection-dialog" data-joseki-selection-dialog>
        <button class="dialog-close" data-joseki-selection-close type="button" aria-label="Close">×</button>
        <h3>${pickText}</h3>
        <p class="muted-text">Select exactly ${requiredCount} card${
      requiredCount === 1 ? "" : "s"
    }. Your selected cards are highlighted.</p>
        <p>${selected.size} / ${requiredCount} selected · ${seconds}s remaining</p>
        ${josekiCardGridHtml(setup.availableCards, selected)}
        <div class="actions joseki-selection-actions">
          <button data-joseki-selection-confirm type="button" ${
      selected.size === requiredCount ? "" : "disabled"
    }>Confirm selection</button>
        </div>
      </dialog>
    `;
  }
  const activeSeatId = setup.placementOrder[setup.placementIndex];
  const activeSeat = game.seats.find((seat) => seat.id === activeSeatId);
  const canPlace = activeSeat?.playerUuid === session?.uuid;
  const placement = setup.currentPlacement;
  const cornerButton = (label: string, corner: NonNullable<typeof placement>["corner"]) =>
    `<button data-joseki-corner="${corner}" type="button" ${
      canPlace && !setup.placedCorners.includes(corner) ? "" : "disabled"
    }>${label}</button>`;
  return `
    <div class="joseki-setup players-panel__setup">
      <strong>${canPlace ? "Place joseki" : "Waiting for joseki placement"}</strong>
      <span>${placement?.cardId ?? ""}</span>
      <div class="actions joseki-corner-actions">
        ${cornerButton("TL", "upper-left")}
        ${cornerButton("TR", "upper-right")}
        ${cornerButton("BR", "lower-right")}
        ${cornerButton("BL", "lower-left")}
      </div>
      <div class="actions">
        <button data-joseki-placement="swap" type="button" ${
    canPlace ? "" : "disabled"
  }>Swap</button>
        <button data-joseki-placement="flip" type="button" ${
    canPlace ? "" : "disabled"
  }>Flip</button>
        <button data-joseki-placement="confirm" type="button" ${
    canPlace ? "" : "disabled"
  }>Confirm</button>
      </div>
    </div>
  `;
}

function boardPointsHtml(
  game: Game,
  boardColors: number[],
  boardOpacity: number[] | undefined,
  edge: number,
): string {
  return boardColors.map((color, index) => {
    const point = pointPosition(game, index, edge);
    const opacity = boardOpacity?.[index] ?? 1;
    const renderColor = color === 99 ? 3 : color;
    return `<button class="point ${game.deadStones?.[index] ? "is-dead" : ""} ${
      game.noScorePoints?.[index] ? "is-no-score" : ""
    }" aria-label="${pointLabel(game, index)}" data-index="${index}" data-color="${renderColor}" ${
      color === -1 ? "disabled" : ""
    } style="left: ${point.left}%; top: ${point.top}%; --stone-color: ${
      stoneColor(game, color)
    }; --stone-opacity: ${opacity}"></button>`;
  }).join("");
}
