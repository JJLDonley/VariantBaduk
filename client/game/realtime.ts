import type { Game, GameId, GameUpdate, UserSummary } from "../types/domain.ts";

type GameSocketMessage = {
  type?: string;
  game?: Game | GameUpdate;
  users?: UserSummary[];
  error?: string;
};

/**
 * Applies an update to the last game this socket received. Built from the update itself (not
 * spread over the previous game) so fields the server stopped sending don't linger.
 */
export function mergeGameUpdate(previous: Game, update: GameUpdate): Game {
  const { historyFrom, history, ...game } = update;
  return {
    ...game,
    config: previous.config,
    history: (previous.history ?? []).slice(0, historyFrom).concat(history),
  };
}

export function connectGameSocket(
  gameId: GameId,
  socketState: { socket?: WebSocket; gameId?: GameId },
  renderGame: (game: Game) => void,
  reconnect: (gameId: GameId) => void,
  onActionError: (error: string) => void = () => {},
): void {
  if (socketState.gameId === gameId && socketState.socket?.readyState === WebSocket.OPEN) return;
  socketState.socket?.close();
  socketState.gameId = gameId;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/api/games/${gameId}/ws`);
  socketState.socket = socket;
  // Updates are relative to what this socket has received; a new socket starts with a snapshot.
  let lastGame: Game | undefined;
  socket.addEventListener("message", (event) => {
    if (socketState.socket !== socket) return;
    const message = JSON.parse(String(event.data)) as GameSocketMessage;
    if (message.type === "snapshot" && message.game) {
      lastGame = message.game as Game;
      renderGame(lastGame);
    } else if (message.type === "update" && message.game && lastGame) {
      lastGame = mergeGameUpdate(lastGame, message.game as GameUpdate);
      renderGame(lastGame);
    } else if (message.type === "presence" && message.users && lastGame) {
      lastGame = { ...lastGame, users: message.users };
      renderGame(lastGame);
    } else if (message.type === "action_error" && message.error) {
      const status = document.querySelector("#status");
      if (status) status.textContent = message.error;
      onActionError(message.error);
    }
  });
  socket.addEventListener("close", () => {
    if (socketState.gameId === gameId) setTimeout(() => reconnect(gameId), 1000);
  });
}

export function disconnectGameSocket(socketState: { socket?: WebSocket; gameId?: GameId }): void {
  socketState.gameId = undefined;
  socketState.socket?.close();
}
