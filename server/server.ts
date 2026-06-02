import { getOrCreateSession } from "./auth.ts";
import { invalidVariantComboMessage } from "./configValidation.ts";
import { GameStore, gameStore, toClientGameView } from "./gameStore.ts";
import { getJosekiCard, listJosekiCards } from "./josekiCards.ts";
import { sanitizePublicName } from "./profanity.ts";
import { type RoomHub, roomHub } from "./realtime.ts";

const DEFAULT_PORT = 8000;
const STATIC_DIR = new URL("../public/", import.meta.url);

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export type HealthResponse = {
  ok: true;
  service: "variant-go-server";
};

export function createHealthResponse(): HealthResponse {
  return { ok: true, service: "variant-go-server" };
}

class GameEvents {
  private readonly clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private readonly encoder = new TextEncoder();

  response(signal: AbortSignal): Response {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.clients.add(controller);
        controller.enqueue(this.encoder.encode(`event: ready\ndata: {}\n\n`));
        signal.addEventListener("abort", () => this.clients.delete(controller), { once: true });
      },
      cancel: () => {},
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  }

  broadcast(type: string): void {
    const message = this.encoder.encode(`event: ${type}\ndata: {}\n\n`);
    for (const client of [...this.clients]) {
      try {
        client.enqueue(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const handler = createHandler(gameStore, roomHub);

export function createHandler(store: GameStore, hub: RoomHub = roomHub) {
  const gameEvents = new GameEvents();
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json(createHealthResponse());
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      const { session, headers } = await getOrCreateSession(request);
      if (session.name) store.setPlayerName(session.uuid, session.name);
      return json({
        uuid: session.uuid,
        name: session.name ?? store.getPlayerName(session.uuid),
        token: session.token,
        isNew: session.isNew,
      }, { headers });
    }

    if (url.pathname === "/api/session/name" && request.method === "POST") {
      const body = await readJson(request);
      const name = sanitizePublicName(body.name, "Player", 16);
      const { session, headers } = await getOrCreateSession(request, undefined, name);
      store.setPlayerName(session.uuid, name);
      for (const gameId of hub.updateUserName(session.uuid, store.getPlayerName(session.uuid))) {
        const record = store.get(gameId);
        if (record) hub.broadcastGame(record);
      }
      return json({
        uuid: session.uuid,
        name: store.getPlayerName(session.uuid),
        token: session.token,
      }, { headers });
    }

    if (url.pathname === "/api/games" && request.method === "GET") {
      const { session, headers } = await getOrCreateSession(request);
      return json({ games: store.list().map((record) => toClientGameView(record, session.uuid)) }, {
        headers,
      });
    }

    if (url.pathname === "/api/games/events" && request.method === "GET") {
      return gameEvents.response(request.signal);
    }

    if (url.pathname === "/api/joseki-cards" && request.method === "GET") {
      return json({ cards: await listJosekiCards() });
    }

    const josekiCardMatch = url.pathname.match(/^\/api\/joseki-cards\/([^/]+)$/);
    if (josekiCardMatch && request.method === "GET") {
      const card = await getJosekiCard(josekiCardMatch[1]);
      if (!card) return json({ error: "joseki_card_not_found" }, { status: 404 });
      return json({ card });
    }

    if (url.pathname === "/api/games" && request.method === "POST") {
      const { session, headers } = await getOrCreateSession(request);
      const body = await readJson(request);
      const invalidVariantCombo = invalidVariantComboMessage(body);
      if (invalidVariantCombo) {
        return json({ error: invalidVariantCombo }, { status: 400, headers });
      }
      const record = store.create(body, session.uuid);
      hub.broadcastGame(record);
      gameEvents.broadcast("games_changed");
      return json({ game: hub.toRealtimeGameView(record, session.uuid) }, { status: 201, headers });
    }

    const wsMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/ws$/);
    if (wsMatch && request.method === "GET") {
      const record = store.get(wsMatch[1]);
      if (!record) return json({ error: "game_not_found" }, { status: 404 });
      const { session } = await getOrCreateSession(request);
      if (session.name) store.setPlayerName(session.uuid, session.name);
      const { socket, response } = Deno.upgradeWebSocket(request);
      let lastSocketActionAt = 0;
      socket.addEventListener("open", () => {
        hub.subscribe(
          record.id,
          socket,
          { uuid: session.uuid, name: store.getPlayerName(session.uuid) },
          () => hub.broadcastGame(record),
        );
        hub.send(socket, { type: "snapshot", game: hub.toRealtimeGameView(record, session.uuid) });
      });
      socket.addEventListener("message", (event) => {
        const now = Date.now();
        if (now - lastSocketActionAt < 80) {
          hub.send(socket, { type: "action_error", error: "too_many_actions" });
          return;
        }
        lastSocketActionAt = now;
        const body = readSocketJson(event.data);
        if (body.type !== "action") return;
        const action = parseAction(isRecord(body.action) ? body.action : {});
        if (!action) {
          hub.send(socket, { type: "action_error", error: "bad_action" });
          return;
        }
        const result = store.applyAction(record.id, session.uuid, action);
        if (!result.ok) {
          const updated = store.get(record.id);
          if (updated) hub.broadcastGame(updated);
          hub.send(socket, { type: "action_error", error: result.error });
          return;
        }
        hub.broadcastGame(result.record);
      });
      return response;
    }

    const gameMatch = url.pathname.match(/^\/api\/games\/([^/]+)$/);
    if (gameMatch && request.method === "GET") {
      const record = store.get(gameMatch[1]);
      if (!record) return json({ error: "game_not_found" }, { status: 404 });
      const { session, headers } = await getOrCreateSession(request);
      return json({ game: hub.toRealtimeGameView(record, session.uuid) }, { headers });
    }

    const seatMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/seats\/([^/]+)\/join$/);
    if (seatMatch && request.method === "POST") {
      const { session, headers } = await getOrCreateSession(request);
      const record = store.joinSeat(seatMatch[1], seatMatch[2], session.uuid);
      if (!record) return json({ error: "seat_unavailable" }, { status: 404, headers });
      hub.broadcastGame(record);
      return json({ game: hub.toRealtimeGameView(record, session.uuid) }, { headers });
    }

    const leaveSeatMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/seats\/([^/]+)\/leave$/);
    if (leaveSeatMatch && request.method === "POST") {
      const { session, headers } = await getOrCreateSession(request);
      const record = store.leaveSeat(leaveSeatMatch[1], leaveSeatMatch[2], session.uuid);
      if (!record) return json({ error: "seat_unavailable" }, { status: 404, headers });
      hub.broadcastGame(record);
      return json({ game: hub.toRealtimeGameView(record, session.uuid) }, { headers });
    }

    const actionMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/actions$/);
    if (actionMatch && request.method === "POST") {
      const { session, headers } = await getOrCreateSession(request);
      const body = await readJson(request);
      const action = parseAction(body);
      if (!action) return json({ error: "bad_action" }, { status: 400, headers });

      const result = store.applyAction(actionMatch[1], session.uuid, action);
      if (!result.ok) {
        const updated = store.get(actionMatch[1]);
        if (updated) hub.broadcastGame(updated);
        const status = result.error === "game_not_found" ? 404 : 400;
        return json({
          error: result.error,
          ...(updated ? { game: hub.toRealtimeGameView(updated, session.uuid) } : {}),
        }, { status, headers });
      }
      hub.broadcastGame(result.record);
      return json({ game: hub.toRealtimeGameView(result.record, session.uuid) }, { headers });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, { status: 404 });
    }

    return await serveSpaAsset(url.pathname);
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function readSocketJson(data: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(data));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAction(body: Record<string, unknown>) {
  const seatId = typeof body.seatId === "string" ? body.seatId : undefined;
  if (body.type === "pass") return { type: "pass", ...(seatId ? { seatId } : {}) } as const;
  if (body.type === "resign") return { type: "resign", ...(seatId ? { seatId } : {}) } as const;
  if (body.type === "cancel") return { type: "cancel", ...(seatId ? { seatId } : {}) } as const;
  if (body.type === "acceptScore") {
    return { type: "acceptScore", ...(seatId ? { seatId } : {}) } as const;
  }
  if (
    body.type === "place" || body.type === "placeHidden" || body.type === "toggleDead" ||
    body.type === "toggleNoScore"
  ) {
    const x = Number(body.x);
    const y = Number(body.y);
    if (Number.isInteger(x) && Number.isInteger(y)) {
      return { type: body.type, point: { x, y }, ...(seatId ? { seatId } : {}) } as const;
    }
  }
  if (body.type === "selectJosekiCards" && Array.isArray(body.cardIds)) {
    return {
      type: "selectJosekiCards",
      cardIds: body.cardIds.map(String),
      ...(seatId ? { seatId } : {}),
    } as const;
  }
  if (body.type === "confirmJosekiSelection") {
    return { type: "confirmJosekiSelection", ...(seatId ? { seatId } : {}) } as const;
  }
  if (body.type === "updateJosekiPlacement" && isRecord(body.placement)) {
    return {
      type: "updateJosekiPlacement",
      placement: body.placement,
      ...(seatId ? { seatId } : {}),
    } as const;
  }
  if (body.type === "confirmJosekiPlacement") {
    return { type: "confirmJosekiPlacement", ...(seatId ? { seatId } : {}) } as const;
  }
  return undefined;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

async function serveSpaAsset(pathname: string): Promise<Response> {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const fileUrl = new URL(`.${safePath}`, STATIC_DIR);

  if (!fileUrl.href.startsWith(STATIC_DIR.href)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await Deno.readFile(fileUrl);
    return new Response(file, {
      headers: { "content-type": contentType(fileUrl.pathname) },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      const index = await Deno.readFile(new URL("index.html", STATIC_DIR));
      return new Response(index, {
        headers: { "content-type": CONTENT_TYPES[".html"] },
      });
    }
    throw error;
  }
}

function contentType(pathname: string): string {
  const extension = pathname.match(/\.[^.]+$/)?.[0] ?? ".html";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

if (import.meta.main) {
  const port = Number(Deno.env.get("PORT") ?? DEFAULT_PORT);
  const databasePath = Deno.env.get("DATABASE_PATH") ?? "baduk.db";
  const { SqliteRepository } = await import("./sqliteRepository.ts");
  const persistentStore = new GameStore(new SqliteRepository(databasePath));
  console.log(`variant-go-server listening on http://localhost:${port}`);
  Deno.serve({ port }, createHandler(persistentStore, roomHub));
}
