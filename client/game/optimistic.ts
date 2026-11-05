import type { Game, GameAction, GameId, Session } from "../types/domain.ts";
import { currentActionSeat } from "./actions.ts";

/** A stone shown right away while the server confirms the move. */
export type PendingMove = {
  gameId: GameId;
  index: number;
  team: number;
  /** Moves played when the stone was placed; the server's move bumps it. */
  playMoves: number;
};

/**
 * Variant switches allowed while previewing a move. Everything else (pixel, phantom, hidden,
 * traitor, Katachi, ...) can change what a click places, so those games wait for the server.
 * An allowlist, so new variants default to the safe behaviour.
 */
const PREVIEW_SAFE_SWITCHES = new Set(["capturesGivePoints"]);

export function isPlainGame(game: Game): boolean {
  return Object.entries(game.config.variants ?? {}).every(([key, value]) =>
    typeof value !== "boolean" || !value || PREVIEW_SAFE_SWITCHES.has(key)
  );
}

/** The pending stone to show for `action`, or undefined if this move must wait for the server. */
export function optimisticPlacement(
  game: Game,
  session: Session | undefined,
  action: GameAction,
  pending: PendingMove | undefined,
): PendingMove | undefined {
  if (pending || action.type !== "place" || game.phase !== "play") return undefined;
  if (!isPlainGame(game)) return undefined;
  const { x, y } = action;
  if (
    !Number.isInteger(x) || !Number.isInteger(y) || x! < 0 || y! < 0 ||
    x! >= game.boardWidth || y! >= game.boardHeight
  ) {
    return undefined;
  }
  const index = y! * game.boardWidth + x!;
  if (game.board[index] !== 0) return undefined;
  const seat = currentActionSeat(game, session, "play");
  if (!seat) return undefined;
  return { gameId: game.id, index, team: seat.team, playMoves: game.playMoves ?? 0 };
}

/** The server answered for this move (or the game moved on), so the preview can go. */
export function isPendingSettled(pending: PendingMove, game: Game): boolean {
  if (String(pending.gameId) !== String(game.id)) return true;
  return (game.playMoves ?? 0) > pending.playMoves || game.board[pending.index] !== 0 ||
    game.phase !== "play";
}
