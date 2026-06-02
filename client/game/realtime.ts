import type { Game, GameId } from "../types/domain.ts";

type GameSocketMessage = {
  type?: string;
  game?: Game;
  error?: string;
};

export function connectGameSocket(
  gameId: GameId,
  socketState: { socket?: WebSocket; gameId?: GameId },
  renderGame: (game: Game) => void,
  renderGameList: () => Promise<void>,
  reconnect: (gameId: GameId) => void,
): void {
  if (socketState.gameId === gameId && socketState.socket?.readyState === WebSocket.OPEN) return;
  socketState.socket?.close();
  socketState.gameId = gameId;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/api/games/${gameId}/ws`);
  socketState.socket = socket;
  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(String(event.data)) as GameSocketMessage;
    if (message.type === "snapshot" && message.game) {
      renderGame(message.game);
      await renderGameList();
    } else if (message.type === "action_error" && message.error) {
      const status = document.querySelector("#status");
      if (status) status.textContent = message.error;
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
