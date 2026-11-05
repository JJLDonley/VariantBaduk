import { postGameAction } from "../api/http.ts";
import type { Game, GameAction, Seat, Session } from "../types/domain.ts";

export function currentActionSeat(
  game: Game,
  session: Session | undefined,
  mode = game.phase,
): Seat | undefined {
  if (mode === "scoring") {
    return game.seats.find((seat, index) =>
      seat.playerUuid === session?.uuid && !seat.resigned && !game.scoreAccepted?.[index]
    );
  }
  if (mode === "joseki" || mode === "hidden") {
    return game.seats.find((seat) => seat.playerUuid === session?.uuid && !seat.resigned);
  }
  const activeSeat = game.seats[game.turn];
  return activeSeat?.playerUuid === session?.uuid && !activeSeat.resigned ? activeSeat : undefined;
}

export function withCurrentSeat(
  game: Game,
  session: Session | undefined,
  action: GameAction,
): GameAction {
  const seat = currentActionSeat(
    game,
    session,
    action.type === "acceptScore" || action.type === "toggleDead" ? "scoring" : game.phase,
  );
  return seat ? { ...action, seatId: seat.id } : action;
}

/**
 * Sends an action over the game socket, or over HTTP when the socket isn't open. Resolves false
 * only when the server rejected it over HTTP; socket rejections arrive later as action_error.
 */
export async function sendGameAction(
  gameId: string | number,
  action: GameAction,
  statusElement: Element | null,
  renderGame: (game: Game) => void,
  socketState?: { socket?: WebSocket; gameId?: string | number },
): Promise<boolean> {
  if (statusElement) statusElement.textContent = "Sending…";
  if (socketState?.gameId === gameId && socketState.socket?.readyState === WebSocket.OPEN) {
    socketState.socket.send(JSON.stringify({ type: "action", action }));
    return true;
  }
  const response = await postGameAction(gameId, action);
  const body = await response.json();
  if (!response.ok) {
    if (statusElement) statusElement.textContent = body.error ?? "Illegal action";
    if (body.game) renderGame(body.game);
    return false;
  }
  renderGame(body.game);
  return true;
}

/**
 * Settings for a new game copied from an existing one. A game stores main time in seconds, but
 * creating a game takes minutes (like the form), so it is converted back; otherwise each remake
 * multiplies the clock by 60 (5 minutes became 5 hours). Period time and increment are in seconds
 * in both.
 */
export function remakeConfig<T extends { name?: string; time?: { main?: number } }>(config: T): T {
  const next = JSON.parse(JSON.stringify(config)) as T;
  delete next.name;
  if (next.time?.main !== undefined) next.time.main /= 60;
  return next;
}
