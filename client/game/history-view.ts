import type { Game, GameId, Session } from "../types/domain.ts";
import {
  canNavigateGameHistory,
  visualHistoryEntries,
  type VisualHistoryEntry,
} from "./history.ts";
import { currentActionSeat } from "./actions.ts";

export type GameHistoryView = {
  rawHistory: NonNullable<Game["history"]>;
  visualHistory: VisualHistoryEntry[];
  latestHistoryIndex: number;
  historyIndex: number;
  viewingHistory: boolean;
  boardColors: number[];
  boardOpacity: number[] | undefined;
  visualHistoryIndex: number;
  playableHistoryCount: number;
  playableHistoryIndex: number;
  canNavigateHistory: boolean;
  canUsePlayActions: boolean;
  canUndo: boolean;
  canResign: boolean;
  passOrDoneDisabled: boolean;
};

export function gameHistoryView(
  game: Game,
  session: Session | undefined,
  historyViewByGame: Map<GameId, number>,
): GameHistoryView {
  const rawHistory = game.history ?? [];
  const visualHistory = visualHistoryEntries(rawHistory);
  const latestHistoryIndex = Math.max(0, rawHistory.length - 1);
  const requestedHistoryIndex = historyViewByGame.get(game.id) ?? latestHistoryIndex;
  const historyIndex = Math.min(requestedHistoryIndex, latestHistoryIndex);
  if (historyIndex === latestHistoryIndex) historyViewByGame.delete(game.id);
  else historyViewByGame.set(game.id, historyIndex);
  const viewingHistory = historyIndex !== latestHistoryIndex;
  const historyEntry = rawHistory[historyIndex];
  const boardColors = viewingHistory ? historyEntry?.board ?? game.board : game.board;
  const boardOpacity = viewingHistory ? historyEntry?.boardOpacity : game.boardOpacity;
  const visualHistoryIndex = viewingHistory
    ? Math.max(0, visualHistory.findIndex((entry) => entry.index === historyIndex))
    : visualHistory.length;
  const hiddenSetupOffset = visualHistory[0]?.entry.action === "placeHidden" ? 1 : 0;
  const playableHistoryCount = Math.max(0, visualHistory.length - hiddenSetupOffset);
  const playableHistoryIndex = viewingHistory
    ? Math.max(0, visualHistoryIndex + 1 - hiddenSetupOffset)
    : playableHistoryCount;
  const canNavigateHistory = canNavigateGameHistory(game, session);
  const allSeatsFilled = game.seats.every((seat) => Boolean(seat.playerUuid));
  const currentSeat = currentActionSeat(game, session);
  const canUsePlayActions = allSeatsFilled && !viewingHistory && game.phase === "play" &&
    Boolean(currentSeat && !currentSeat.resigned);
  const canAcceptScore = allSeatsFilled && !viewingHistory && game.phase === "scoring" &&
    Boolean(currentActionSeat(game, session, "scoring"));
  const canUndo = canUsePlayActions && rawHistory.length >= 2 &&
    rawHistory.at(-2)?.phase === "play";
  const canResign = canUsePlayActions;
  const passOrDoneDisabled = game.phase === "scoring" ? !canAcceptScore : !canUsePlayActions;
  return {
    rawHistory,
    visualHistory,
    latestHistoryIndex,
    historyIndex,
    viewingHistory,
    boardColors,
    boardOpacity,
    visualHistoryIndex,
    playableHistoryCount,
    playableHistoryIndex,
    canNavigateHistory,
    canUsePlayActions,
    canUndo,
    canResign,
    passOrDoneDisabled,
  };
}
