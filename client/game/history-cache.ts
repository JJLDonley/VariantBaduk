import type { Game, GameId, HistoryEntry } from "../types/domain.ts";

/**
 * Past positions fetched for history review: a contiguous prefix history[0, entries.length).
 * Snapshots only carry the move list, so boards are loaded the first time someone reviews and
 * then extended as the game goes on.
 */
export type HistoryBoards = {
  gameId: GameId;
  /** Visibility changes once the game ends (everything is revealed), so it keys the cache. */
  done: boolean;
  entries: HistoryEntry[];
};

/** Drops cached boards that no longer match `game` (other game, game just ended, undo). */
export function reconcileHistoryBoards(
  cache: HistoryBoards | undefined,
  game: Game,
): HistoryBoards | undefined {
  if (!cache || String(cache.gameId) !== String(game.id)) return undefined;
  if (cache.done !== (game.phase === "done")) return undefined;
  // Undo pops entries off the end; keep only what is certainly unchanged.
  const keep = Math.max(0, (game.history?.length ?? 0) - 1);
  return cache.entries.length > keep ? { ...cache, entries: cache.entries.slice(0, keep) } : cache;
}

/** Copies cached boards into the game's history entries for rendering. */
export function withHistoryBoards(game: Game, cache: HistoryBoards | undefined): Game {
  if (!cache?.entries.length || !game.history) return game;
  return {
    ...game,
    history: game.history.map((entry, index) => {
      const cached = cache.entries[index];
      return cached ? { ...entry, ...cached } : entry;
    }),
  };
}

/** Where to fetch from so `index` is covered, or undefined if it already is. */
export function historyFetchStart(
  cache: HistoryBoards | undefined,
  game: Game,
  index: number,
): number | undefined {
  const usable = reconcileHistoryBoards(cache, game);
  const have = usable?.entries.length ?? 0;
  return index < have ? undefined : have;
}

/** Adds fetched entries if they continue the cached prefix; otherwise keeps what is there. */
export function addHistoryBoards(
  cache: HistoryBoards | undefined,
  game: Game,
  from: number,
  entries: HistoryEntry[],
): HistoryBoards | undefined {
  const base = reconcileHistoryBoards(cache, game) ??
    { gameId: game.id, done: game.phase === "done", entries: [] };
  if (from !== base.entries.length) return base;
  return reconcileHistoryBoards({ ...base, entries: base.entries.concat(entries) }, game);
}
