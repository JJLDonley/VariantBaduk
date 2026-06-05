import type { Game, GameAction, GameId, Session } from "../types/domain.ts";
import { joinSeat, leaveSeat } from "../api/http.ts";
import { currentActionSeat, withCurrentSeat } from "./actions.ts";
import { clearBoardPreview, placementPointFromEvent, setBoardPreview } from "./board-render.ts";
import { copyText } from "../ui/clipboard.ts";
import { clearJosekiCardHover, hoverJosekiCardOnBoard } from "./joseki-placement.ts";
import { openCustomGobanPreview } from "../create/custom-goban.ts";
import { bindHistoryKeyboardControls, type HistoryNavigationAction } from "./history-controls.ts";

type BindGameEventsOptions = {
  panel: ParentNode;
  game: Game;
  session: Session | undefined;
  boardColors: number[];
  viewingHistory: boolean;
  historyIndex: number;
  latestHistoryIndex: number;
  historyKeyController: AbortController | undefined;
  statusElement: Element | null;
  sendAction: (gameId: GameId, action: GameAction) => Promise<void>;
  renderGameList: () => Promise<void>;
  showGame: (gameId: GameId) => Promise<void>;
  navigateGameHistory: (
    game: Game,
    historyIndex: number,
    latestHistoryIndex: number,
    action: HistoryNavigationAction | string,
  ) => void;
  canNavigateGameHistory: (game: Game) => boolean;
  showCoordinates: boolean;
  toggleCoordinates: () => void;
};

export function bindGameEvents(options: BindGameEventsOptions): AbortController | undefined {
  bindPlayersToggle(options.panel);
  bindInfoDialog(options.panel);
  bindCustomGobanPreview(options);
  bindBoard(options);
  bindJosekiSetup(options);
  bindActionButtons(options);
  bindHistoryButtons(options);
  const historyKeyController = bindHistoryKeyboardControls(
    options.game,
    options.historyIndex,
    options.latestHistoryIndex,
    options.historyKeyController,
    options.canNavigateGameHistory,
    options.navigateGameHistory,
  );
  bindSeats(options);
  return historyKeyController;
}

function bindPlayersToggle(panel: ParentNode): void {
  const playersToggle = panel.querySelector<HTMLElement>(".players-toggle");
  const seats = panel.querySelector<HTMLElement>(".seats");
  playersToggle?.addEventListener("click", () => {
    const expanded = playersToggle.getAttribute("aria-expanded") === "true";
    playersToggle.setAttribute("aria-expanded", String(!expanded));
    if (seats) seats.hidden = expanded;
  });
}

function bindInfoDialog(panel: ParentNode): void {
  const infoDialog = panel.querySelector<HTMLDialogElement>(".game-info-dialog");
  panel.querySelector(".game-info-toggle")?.addEventListener(
    "click",
    () => infoDialog?.showModal(),
  );
  infoDialog?.querySelector(".dialog-close")?.addEventListener("click", () => infoDialog.close());
}

function bindCustomGobanPreview({ panel, game, statusElement }: BindGameEventsOptions): void {
  for (const link of panel.querySelectorAll("[data-cgoban-preview]")) {
    link.addEventListener(
      "click",
      () => openCustomGobanPreview(game.config.customGoban, statusElement),
    );
    link.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      openCustomGobanPreview(game.config.customGoban, statusElement);
    });
  }
}

function bindBoard(options: BindGameEventsOptions): void {
  const { panel, game, session, boardColors, viewingHistory, sendAction, showCoordinates } =
    options;
  const board = panel.querySelector<HTMLElement>(".board");
  let activePointerId: number | undefined;
  let josekiHoverCorner = game.josekiSetup?.currentPlacement?.corner;
  board?.addEventListener("contextmenu", (event) => event.preventDefault());
  board?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointerId = event.pointerId;
    board.setPointerCapture(event.pointerId);
    setBoardPreview(board, game, event, showCoordinates);
  });
  board?.addEventListener("pointermove", (event) => {
    if (game.phase === "joseki" && game.josekiSetup?.phase === "place") {
      const nextCorner = josekiCornerFromEvent(board, event);
      if (game.josekiSetup.placedCorners.includes(nextCorner)) return;
      if (nextCorner !== josekiHoverCorner) {
        josekiHoverCorner = nextCorner;
        const placement = game.josekiSetup.currentPlacement;
        if (placement) {
          void sendAction(
            game.id,
            withCurrentSeat(game, session, {
              type: "updateJosekiPlacement",
              placement: { ...placement, corner: nextCorner },
            }),
          );
        }
      }
      return;
    }
    if (activePointerId !== event.pointerId) {
      if (activePointerId === undefined && event.pointerType === "mouse") {
        setBoardPreview(board, game, event, showCoordinates);
      }
      return;
    }
    event.preventDefault();
    setBoardPreview(board, game, event, showCoordinates);
  });
  board?.addEventListener("pointerleave", () => {
    if (activePointerId === undefined) clearBoardPreview(board);
  });
  board?.addEventListener("pointercancel", () => {
    activePointerId = undefined;
    clearBoardPreview(board);
  });
  board?.addEventListener("pointerup", async (event) => {
    if (activePointerId !== event.pointerId) return;
    event.preventDefault();
    activePointerId = undefined;
    const point = placementPointFromEvent(board, game, event, showCoordinates);
    clearBoardPreview(board);
    if (!point || viewingHistory || game.phase === "joseki") return;
    if (game.phase === "hidden") {
      await sendAction(
        game.id,
        withCurrentSeat(game, session, { type: "placeHidden", x: point.x, y: point.y }),
      );
    } else if (game.phase === "scoring") {
      if (!currentActionSeat(game, session, "scoring")) return;
      const pointIndex = point.y * game.boardWidth + point.x;
      if (boardColors[pointIndex] === -1) return;
      const actionType = event.shiftKey || event.button === 2 || boardColors[pointIndex] === 0
        ? "toggleNoScore"
        : "toggleDead";
      await sendAction(
        game.id,
        withCurrentSeat(game, session, {
          type: actionType,
          x: point.x,
          y: point.y,
        }),
      );
    } else if (game.phase === "play") {
      await sendAction(
        game.id,
        withCurrentSeat(game, session, { type: "place", x: point.x, y: point.y }),
      );
    }
  });
}

function isJosekiCorner(
  value: string | undefined,
): value is "upper-left" | "upper-right" | "lower-left" | "lower-right" {
  return value === "upper-left" || value === "upper-right" || value === "lower-left" ||
    value === "lower-right";
}

function josekiCornerFromEvent(
  board: HTMLElement,
  event: PointerEvent,
): "upper-left" | "upper-right" | "lower-left" | "lower-right" {
  const rect = board.getBoundingClientRect();
  const left = event.clientX < rect.left + rect.width / 2;
  const upper = event.clientY < rect.top + rect.height / 2;
  if (upper && left) return "upper-left";
  if (upper) return "upper-right";
  return left ? "lower-left" : "lower-right";
}

function bindJosekiSetup({ panel, game, session, sendAction }: BindGameEventsOptions): void {
  const ownedSeatIds = new Set(
    game.seats.filter((seat) => seat.playerUuid === session?.uuid).map((seat) => seat.id),
  );
  const ownedSetups = game.josekiSetup?.seats.filter((entry) => ownedSeatIds.has(entry.seatId)) ??
    [];
  const requiredCount = Math.max(2, ownedSetups.length * 2);
  const board = panel.querySelector<HTMLElement>(".board");
  const selectionDialog = panel.querySelector<HTMLDialogElement>("[data-joseki-selection-dialog]");
  panel.querySelector<HTMLButtonElement>("[data-joseki-selection-open]")?.addEventListener(
    "click",
    () => selectionDialog?.showModal(),
  );
  selectionDialog?.querySelector("[data-joseki-selection-close]")?.addEventListener(
    "click",
    () => selectionDialog.close(),
  );
  if (selectionDialog && ownedSetups.length > 0 && game.josekiSetup?.phase === "select") {
    try {
      if (!selectionDialog.open) selectionDialog.showModal();
    } catch {
      selectionDialog.setAttribute("open", "");
    }
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-joseki-card-id]")) {
    button.addEventListener("pointerenter", () => {
      if (board && button.dataset.josekiCardId) {
        hoverJosekiCardOnBoard(board, game, button.dataset.josekiCardId);
      }
    });
    button.addEventListener("pointerleave", () => clearJosekiCardHover(board));
    button.addEventListener("click", async () => {
      const id = button.dataset.josekiCardId;
      if (!id || ownedSetups.length === 0) return;
      const selected = new Set(ownedSetups.flatMap((entry) => entry.selectedCardIds));
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < requiredCount) selected.add(id);
      await sendAction(
        game.id,
        withCurrentSeat(game, session, { type: "selectJosekiCards", cardIds: [...selected] }),
      );
    });
  }
  panel.querySelector<HTMLButtonElement>("[data-joseki-selection-confirm]")?.addEventListener(
    "click",
    async () => {
      await sendAction(game.id, withCurrentSeat(game, session, { type: "confirmJosekiSelection" }));
    },
  );
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-joseki-corner]")) {
    button.addEventListener("click", async () => {
      const placement = game.josekiSetup?.currentPlacement;
      const corner = button.dataset.josekiCorner;
      if (!placement || !isJosekiCorner(corner)) return;
      await sendAction(
        game.id,
        withCurrentSeat(game, session, {
          type: "updateJosekiPlacement",
          placement: { ...placement, corner },
        }),
      );
    });
  }
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-joseki-placement]")) {
    button.addEventListener("click", async () => {
      const placement = game.josekiSetup?.currentPlacement;
      if (!placement) return;
      const action = button.dataset.josekiPlacement;
      if (action === "confirm") {
        await sendAction(
          game.id,
          withCurrentSeat(game, session, { type: "confirmJosekiPlacement" }),
        );
        return;
      }
      const next = { ...placement };
      if (action === "swap") next.swapColors = !next.swapColors;
      if (action === "flip") {
        next.flipX = !next.flipX;
        next.rotate = 0;
      }
      await sendAction(
        game.id,
        withCurrentSeat(game, session, { type: "updateJosekiPlacement", placement: next }),
      );
    });
  }
}

function bindActionButtons(
  { panel, game, session, sendAction, toggleCoordinates }: BindGameEventsOptions,
): void {
  panel.querySelector("[data-toggle-coordinates]")?.addEventListener("click", toggleCoordinates);
  for (const button of panel.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      const type = button.dataset.action;
      if (!type) return;
      await sendAction(game.id, withCurrentSeat(game, session, { type }));
    });
  }
}

function bindHistoryButtons(
  { panel, game, historyIndex, latestHistoryIndex, navigateGameHistory }: BindGameEventsOptions,
): void {
  for (const button of panel.querySelectorAll<HTMLElement>("[data-history]")) {
    button.addEventListener(
      "click",
      () =>
        navigateGameHistory(
          game,
          historyIndex,
          latestHistoryIndex,
          button.dataset.history ?? "latest",
        ),
    );
  }
}

function bindSeats(
  { panel, game, statusElement, renderGameList, showGame }: BindGameEventsOptions,
): void {
  for (
    const button of panel.querySelectorAll<HTMLElement>(
      ".seat[data-open='true'], .team-seat-player[data-open='true']",
    )
  ) {
    const handleJoinSeat = async (event: Event) => {
      if ((event.target as Element | null)?.closest(".seat-action")) return;
      const seatId = button.dataset.seatId;
      if (!seatId) return;
      const response = await joinSeat(game.id, seatId);
      if (!response.ok) return;
      await Promise.all([renderGameList(), showGame(game.id)]);
    };
    button.addEventListener("click", handleJoinSeat);
    button.addEventListener("keydown", async (event) => {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      await handleJoinSeat(event);
    });
  }

  for (const button of panel.querySelectorAll<HTMLElement>(".seat-action")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const seatId = button.dataset.seatId;
      if (button.dataset.action === "join") {
        if (!seatId) return;
        const response = await joinSeat(game.id, seatId);
        if (!response.ok) return;
        await Promise.all([renderGameList(), showGame(game.id)]);
        return;
      }
      if (button.dataset.action === "invite") {
        await copyText(
          `${location.origin}/game/${game.id}#${encodeURIComponent(seatId ?? "")}`,
          button,
          statusElement,
          "Copied",
        );
        return;
      }
      if (!seatId) return;
      await leaveSeat(game.id, seatId);
      await Promise.all([renderGameList(), showGame(game.id)]);
    });
  }
}
