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

export async function sendGameAction(
  gameId: string | number,
  action: GameAction,
  statusElement: Element | null,
  renderGame: (game: Game) => void,
  renderGameList: () => Promise<void>,
  socketState?: { socket?: WebSocket; gameId?: string | number },
): Promise<void> {
  if (statusElement) statusElement.textContent = "Sending…";
  if (socketState?.gameId === gameId && socketState.socket?.readyState === WebSocket.OPEN) {
    socketState.socket.send(JSON.stringify({ type: "action", action }));
    return;
  }
  const response = await postGameAction(gameId, action);
  const body = await response.json();
  if (!response.ok) {
    if (statusElement) statusElement.textContent = body.error ?? "Illegal action";
    if (body.game) renderGame(body.game);
    return;
  }
  renderGame(body.game);
  await renderGameList();
}

export function remakeConfig<T extends { name?: string }>(config: T): T {
  const next = JSON.parse(JSON.stringify(config)) as T;
  delete next.name;
  return next;
}
