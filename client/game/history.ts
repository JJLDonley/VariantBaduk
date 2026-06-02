import type { Game, HistoryEntry, Session } from "../types/domain.ts";

export type VisualHistoryEntry = { entry: HistoryEntry; index: number };

export function visualHistoryEntries(history: HistoryEntry[]): VisualHistoryEntry[] {
  const lastHiddenIndex = history.reduce(
    (last, entry, index) => entry?.action === "placeHidden" ? index : last,
    -1,
  );
  return history
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      if (entry?.action === "place") return true;
      if (lastHiddenIndex >= 0) return index === lastHiddenIndex;
      return index === 0;
    });
}

export function canNavigateGameHistory(game: Game, session: Session | undefined): boolean {
  const isPlayer = game.seats.some((seat) => seat.playerUuid === session?.uuid);
  return game.phase === "done" || !isPlayer;
}

export function nextHistoryIndex(
  history: HistoryEntry[],
  historyIndex: number,
  latestHistoryIndex: number,
  action: string,
): number {
  const visualHistory = visualHistoryEntries(history);
  const viewingHistory = historyIndex !== latestHistoryIndex;
  const currentVisualIndex = viewingHistory
    ? visualHistory.findIndex((entry) => entry.index === historyIndex)
    : visualHistory.length;
  if (action === "first") return visualHistory[0]?.index ?? latestHistoryIndex;
  if (action === "prev") {
    return visualHistory[Math.max(0, currentVisualIndex - 1)]?.index ?? latestHistoryIndex;
  }
  if (action === "next") {
    return currentVisualIndex >= visualHistory.length - 1
      ? latestHistoryIndex
      : visualHistory[currentVisualIndex + 1]?.index ?? latestHistoryIndex;
  }
  return latestHistoryIndex;
}
