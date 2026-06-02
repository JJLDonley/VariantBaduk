import type {
  Game,
  GameAction,
  GameConfig,
  GameId,
  GameListResponse,
  GameResponse,
  HealthResponse,
  JosekiCardResponse,
  JosekiCardsResponse,
  Session,
} from "../types/domain.ts";

async function jsonResponse<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export async function loadBootData(): Promise<{ health: HealthResponse; session: Session }> {
  const [healthResponse, sessionResponse] = await Promise.all([
    fetch("/api/health"),
    fetch("/api/session"),
  ]);
  if (!healthResponse.ok) throw new Error(`health failed: ${healthResponse.status}`);
  if (!sessionResponse.ok) throw new Error(`session failed: ${sessionResponse.status}`);
  return {
    health: await jsonResponse<HealthResponse>(healthResponse),
    session: await jsonResponse<Session>(sessionResponse),
  };
}

export async function updateSessionName(name: string): Promise<Response> {
  return await fetch("/api/session/name", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function readSession(response: Response): Promise<Session> {
  return await jsonResponse<Session>(response);
}

export async function listGames(): Promise<Response> {
  return await fetch("/api/games");
}

export async function readGameList(response: Response): Promise<GameListResponse> {
  return await jsonResponse<GameListResponse>(response);
}

export async function listJosekiCards(): Promise<Response> {
  return await fetch("/api/joseki-cards");
}

export async function readJosekiCards(response: Response): Promise<JosekiCardsResponse> {
  return await jsonResponse<JosekiCardsResponse>(response);
}

export async function getJosekiCard(cardId: string): Promise<Response> {
  return await fetch(`/api/joseki-cards/${encodeURIComponent(cardId)}`);
}

export async function readJosekiCard(response: Response): Promise<JosekiCardResponse> {
  return await jsonResponse<JosekiCardResponse>(response);
}

export async function createGame(config: GameConfig): Promise<Response> {
  return await fetch("/api/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
}

export async function getGame(gameId: GameId): Promise<Response> {
  return await fetch(`/api/games/${gameId}`);
}

export async function readGame(response: Response): Promise<Game> {
  const body = await jsonResponse<GameResponse>(response);
  return body.game;
}

export async function joinSeat(gameId: GameId, seatId: string): Promise<Response> {
  return await fetch(`/api/games/${gameId}/seats/${seatId}/join`, { method: "POST" });
}

export async function leaveSeat(gameId: GameId, seatId: string): Promise<Response> {
  return await fetch(`/api/games/${gameId}/seats/${seatId}/leave`, { method: "POST" });
}

export async function postGameAction(gameId: GameId, action: GameAction): Promise<Response> {
  return await fetch(`/api/games/${gameId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}
