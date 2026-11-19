# Variant Go Server — HTTP API

This is the JSON API that the Variant Go web client uses. An external frontend can use the
same endpoints to create variant games, list them, join seats and play.

All paths are under `/api/`. Requests and responses are JSON (`content-type: application/json`).
Unknown `/api/*` paths return `404 {"error":"not_found"}`.

> **Before you start: same origin required.** The server sends **no CORS headers**, and identity
> comes from an `HttpOnly`, `SameSite=Lax` cookie. A frontend on another origin cannot call the API
> from the browser. Either serve your frontend from the same origin (for example, behind the same
> nginx, with `/api/` proxied to this server) or ask for CORS + `SameSite=None; Secure` cookies to be
> added. Server-to-server calls (curl, a backend) work anywhere if you keep the cookie jar.

---

## Endpoint overview

| Method | Path                                         | Purpose                                   |
| ------ | -------------------------------------------- | ----------------------------------------- |
| GET    | `/api/health`                                | Server status                             |
| GET    | `/api/session`                               | Current player (creates a session)        |
| POST   | `/api/session/name`                          | Change the player's name                  |
| GET    | `/api/games`                                 | List games                                |
| GET    | `/api/games/events`                          | SSE stream: game list changed             |
| POST   | `/api/games`                                 | Create a game                             |
| GET    | `/api/games/{id}`                            | One game, as seen by the caller           |
| GET    | `/api/games/{id}/history?from={n}`           | Board positions for history entries       |
| POST   | `/api/games/{id}/seats/{seatId}/join`        | Sit in a seat                             |
| POST   | `/api/games/{id}/seats/{seatId}/leave`       | Leave a seat                              |
| POST   | `/api/games/{id}/actions`                    | Play a move or other action               |
| GET    | `/api/games/{id}/ws`                         | WebSocket for live play                   |
| GET    | `/api/joseki-cards`, `/api/joseki-cards/{id}`| Joseki Card data                          |
| GET    | `/api/shape-cards`                           | Katachi shape card data                   |

There is no endpoint to delete or edit a game after it is created.

## Conventions

- **Bodies are forgiving.** A body that is not a JSON object (bad JSON, an array, empty) is treated
  as `{}`. Config fields that are missing, the wrong type or out of range are replaced with defaults
  or clamped, not rejected. For example, `"komi": "auto"` or any other non-number gives the ruleset's
  default komi. Always read the normalized `config` in the response to see what was used.
- **Errors** are JSON: `{ "error": "<code>" }`. Codes are short `snake_case` strings, except variant
  conflicts on `POST /api/games`, which return a readable sentence.
- **Ids** are strings. Game ids are numeric strings (`"42"`).
- **Names** (player names, game names) are always plain text. Render them as text, never as HTML.

---

## Quick start: create a variant game and share it

```bash
# 1. Create a game. -c/-b keep the session cookie so you own the seat you sit in.
curl -c jar -b jar -X POST https://HOST/api/games \
  -H 'content-type: application/json' \
  -d '{
        "name": "Friday Zen",
        "boardSize": 9,
        "variants": { "zen": true, "zenPlayerCount": 3 }
      }'
# → 201 {"game": {"id": "42", "seats": [{"id":"player-1", ...}, {"id":"player-2"}, {"id":"player-3"}], ...}}

# 2. Share invite links: /game/{id}#{seatId}
#    https://HOST/game/42#player-2
#    https://HOST/game/42#player-3
```

Opening `/game/{id}#{seatId}` in the web client joins that seat if it is free. To create a game
without sitting in it yourself (a lobby or "game launcher"), send `"creatorSeat": "none"`.

---

## Sessions and identity

There are no accounts. The first request to any session-aware endpoint sets a signed cookie
`vg_session` (one-year rolling JWT). That cookie is the player. Send it back on every request
(`credentials: "include"` / `"same-origin"` with `fetch`, a cookie jar with curl).

Player ids in responses are **public ids**: a stable hash of the real id, safe to show other people.
They cannot be used to act as that player.

### `GET /api/session`

Returns the current player, creating a session if there is none.

```json
{ "uuid": "25f60fbd-2aa8-0cca-c8f1-58693111113d", "name": "Cozy Bear", "isNew": true }
```

New players get a random two-word name.

### `POST /api/session/name`

```json
{ "name": "Jae" }
```

The name is trimmed, cut to 16 characters and filtered for profanity (falls back to `"Player"`).
It updates the name shown on every seat this player holds.
Response: `{ "uuid": "...", "name": "Jae" }`.

---

## Games

### `GET /api/games`

All games, newest first. Only ids and names are included.

```json
{ "games": [{ "id": "42", "config": { "name": "Friday Zen" } }] }
```

### `GET /api/games/events`

A [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream. It sends
`event: ready` on connect, then `event: games_changed` whenever a game is created. The events carry no
data; re-fetch `GET /api/games` when one arrives.

```js
const events = new EventSource("/api/games/events");
events.addEventListener("games_changed", refreshGameList);
```

### `POST /api/games` — create a game

The body is a game config. **Every field is optional**: missing or invalid values are replaced
with defaults or clamped to their allowed range, not rejected. The response contains the
normalized `config`, so you can check what was actually used.

The request is rejected only when the variants can't be combined (see [Variant
conflicts](#variant-conflicts)):

```json
400 { "error": "Magnetic cannot be combined with Pixel." }
```

The error is a readable sentence you can show to the user as is.

On success: `201 { "game": GameView }` (see [Game view](#game-view)).

#### Config fields

| Field         | Type                                                          | Default            | Notes                                                                                                                         |
| ------------- | ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string                                                        | `"Game #{id}"`     | Max 32 chars, profanity-filtered.                                                                                             |
| `boardSize`   | `9` \| `13` \| `19`                                           | `9`                | Any other value becomes `9`.                                                                                                  |
| `customGoban` | object                                                        | —                  | Custom board shape, overrides `boardSize`. See below.                                                                         |
| `ruleset`     | `"chinese"` \| `"aga"` \| `"japanese"` \| `"area"` \| `"territory"` | `"chinese"`        | `japanese`/`territory` use territory scoring; the rest use area scoring. `chinese` uses free handicap placement.              |
| `komi`        | number                                                        | depends on ruleset | If omitted: 7.5 for `chinese`/`aga`, 6.5 for `japanese`, 0.5 for those three with handicap, and **0** for `area`/`territory`. A value that is not a number gives 7.5 (`chinese`/`aga`), 6.5 (others) or 0.5 (with handicap). Clamped to ±1000. |
| `handicap`    | integer 0–9                                                   | `0`                | Ignored on custom boards.                                                                                                     |
| `time`        | object                                                        | no clock           | See below.                                                                                                                    |
| `creatorSeat` | string                                                        | `"black"`          | Seat the creator sits in: `"black"`, `"white"`, `"player-N"`, `"team-T-N"`, or `"none"` to stay out.                          |
| `variants`    | object                                                        | all off            | See below.                                                                                                                    |

**`time`** (no clock if missing or `system` is `"none"`):

| Field              | Type                                      | Notes                                                     |
| ------------------ | ----------------------------------------- | --------------------------------------------------------- |
| `system`           | `"none"` \| `"byoyomi"` \| `"fischer"`    |                                                           |
| `main`             | number                                    | Main time in **minutes**, max 10080 (7 days). The response shows **seconds**. |
| `periods`          | integer 0–100                             | Byo-yomi periods.                                         |
| `periodTime`       | number                                    | Byo-yomi period length, in seconds (max 86400).          |
| `fischerIncrement` | number                                    | Seconds added per move (max 86400).                       |

The clock starts only when every seat is filled.

**`customGoban`**:

```json
{ "width": 7, "height": 5, "points": [0, 0, -1, ...], "starPoints": [{ "x": 3, "y": 2 }] }
```

`width` and `height` are 2–52. `points` is row-major with `width × height` entries: `-1` = removed
point, `0` = playable, `1` = playable star point. If the length is wrong or every point is removed,
the custom board is dropped and `boardSize` is used.

#### Variants

All flags are booleans and default to `false`. Option fields only matter when their variant is on.

| Variant (UI name)     | Flag                | Options                                                                                                                      |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Captures give points  | `capturesGivePoints`| `ponnukiPointValue` (0–1000)                                                                                                    |
| Pixel                 | `pixel`             |                                                                                                                              |
| Magnetic              | `magnetic`          |                                                                                                                              |
| Zen                   | `zen`               | `zenPlayerCount`: odd number 3–9 (default 3)                                                                                 |
| Color Go              | `colorGo`           | `colorGoPlayerCount` 2–4 (default 3); `colorGoColors`: `"#rrggbb"` per player; `colorGoKomi`: number per player (±1000; non-numbers use the default)              |
| Team Go               | `teamGo`            | `teamGoSeatCounts`: players per team, each 0–9, at least two teams > 0 (default `[2, 2]`). With Color Go, one team per color. |
| Phantom               | `phantomMove`       | `phantomHideViewers`                                                                                                         |
| Hidden                | `hiddenMove`        | `hiddenMoveCount` 1–20 (default 3); `hiddenMoveShowViewers` (default `true`)                                                 |
| Joseki Card           | `josekiCard`        | Requires `boardSize: 19` and no custom board.                                                                                |
| Katachi (shape cards) | `shapeCards`        | `shapeCardHandSize` 3–5 (default 4); `shapeCardFull`; `shapeCardReshuffle`                                                   |
| Tetris                | `tetris`            |                                                                                                                              |
| N+1                   | `nPlusOne`          | `nPlusOneCount` 1–52                                                                                                          |
| Traitor               | `traitor`           | `traitorMode`: `"moves"` \| `"percentage"`; `traitorStoneCount` 1–2704 (default 6); `traitorChance` 1–100 (default 10); `showTraitorCounter` |
| Random Turn           | `randomTurn`        |                                                                                                                              |

#### Variant conflicts

These combinations are rejected with `400`:

| Variant     | Cannot be combined with                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Joseki Card | Tetris, Zen, Color Go, custom board, any board size other than 19         |
| Hidden      | Zen                                                                       |
| Zen         | Color Go                                                                  |
| Team Go     | Zen                                                                       |
| Katachi     | Pixel, N+1, Traitor, Tetris, Zen, Color Go, Hidden, Phantom; also `ruleset: "chinese"` with `handicap` > 1 |
| Magnetic    | Pixel, Hidden, Phantom, Katachi                                           |
| Tetris      | Pixel; N+1 with `nPlusOneCount: 4`                                        |

#### Seats

The seats a game gets depend on its variants:

| Game type          | Seat ids                                                            |
| ------------------ | ------------------------------------------------------------------- |
| Standard           | `black`, `white`                                                    |
| Zen / Color Go     | `player-1` … `player-N`                                             |
| Team Go            | `team-{team}-{n}`, e.g. `team-1-1`, `team-2-1`, `team-1-2`, `team-2-2` |

#### Examples

```jsonc
// Standard 19×19 with byo-yomi, 10 min + 5 × 30 s
{ "boardSize": 19, "ruleset": "japanese",
  "time": { "system": "byoyomi", "main": 10, "periods": 5, "periodTime": 30 } }

// 4-player Color Go, 2 vs 2 as teams
{ "boardSize": 13, "variants": { "colorGo": true, "colorGoPlayerCount": 2,
  "teamGo": true, "teamGoSeatCounts": [2, 2] } }

// Hidden + N+1, creator doesn't sit
{ "creatorSeat": "none", "variants": { "hiddenMove": true, "hiddenMoveCount": 4,
  "nPlusOne": true, "nPlusOneCount": 2 } }
```

### `GET /api/games/{id}`

`200 { "game": GameView }`, or `404 { "error": "game_not_found" }`.

The view depends on who is asking. Seat owners see their own hidden or phantom stones and their own
card hands; spectators don't.

### `GET /api/games/{id}/history?from={n}`

The boards for history entries `n` and later (`from` defaults to 0):

```json
{ "from": 0, "entries": [{ "phase": "play", "action": "place", "board": [...], "lastStone": [{ "x": 4, "y": 4 }] }] }
```

Errors: `400 bad_history_range`, `403 history_hidden` (in some hidden-information games, history can
only be viewed after the game ends), `404 game_not_found`.

### `POST /api/games/{id}/seats/{seatId}/join`

Sit in a seat. This works only during the `play` phase and only when the seat is empty (or already
yours). Returns `{ "game": GameView }`, or `404 { "error": "seat_unavailable" }`. One player can
hold several seats.

### `POST /api/games/{id}/seats/{seatId}/leave`

Leave a seat you hold (only during the `play` phase). Same responses as join.

---

## Playing: actions

### `POST /api/games/{id}/actions`

Body is one action. On success: `{ "game": GameView }`. On failure: `400` (or `404 game_not_found`)
with `{ "error": "...", "game": GameView }`. The game is included because some failures still change
it, such as a phantom collision or a clock timeout.

If you hold more than one seat, add `"seatId"` to say which seat is acting.

| Action                                                                 | When                                  |
| ---------------------------------------------------------------------- | ------------------------------------- |
| `{ "type": "place", "x": 3, "y": 4 }`                                   | Play a stone. `x`/`y` are 0-based from the top left. |
| `{ "type": "place", "x": 3, "y": 4, "stoneColor": "self" \| "opponent", "cardId": "..." }` | Katachi: a stone of a card. |
| `{ "type": "pass" }`                                                    | Play                                  |
| `{ "type": "resign" }`                                                  | Any time                              |
| `{ "type": "toggleDead", "x": 3, "y": 4 }`                              | Scoring: mark a group dead/alive      |
| `{ "type": "toggleNoScore", "x": 3, "y": 4 }`                           | Scoring: mark a point as neutral      |
| `{ "type": "acceptScore" }`                                             | Scoring                               |
| `{ "type": "cancel" }`                                                  | Scoring: go back to play              |
| `{ "type": "placeHidden", "x": 3, "y": 4 }`                             | Hidden setup phase                    |
| `{ "type": "selectJosekiCards", "cardIds": ["44a", "34c"] }`            | Joseki select phase                   |
| `{ "type": "confirmJosekiSelection" }`                                  | Joseki select phase                   |
| `{ "type": "updateJosekiPlacement", "placement": { "cardId": "44a", "corner": "upper-left", "rotate": 90, "flipX": false, "swapColors": false } }` | Joseki place phase (partial update) |
| `{ "type": "confirmJosekiPlacement" }`                                  | Joseki place phase                    |
| `{ "type": "startShapeCard", "cardId": "..." }`                         | Katachi: begin a card                 |
| `{ "type": "undoShapeStone" }` / `{ "type": "cancelShapeCard" }`        | Katachi                               |
| `{ "type": "discardShapeCard", "cardId": "..." }`                       | Katachi                               |
| `{ "type": "playShapeCard", "cardId": "...", "stones": [{ "x": 3, "y": 3, "rel": "self" }] }` | Katachi Full: the whole card at once (1–16 stones) |

Action errors: `bad_action` (malformed body), `not_turn`, `waiting_for_players` (empty seats),
`out_of_bounds`, `point_occupied`, `suicide`, `ko`, `illegal`, `card_not_in_hand`,
`card_in_progress`, `no_card_in_progress`, `not_in_shape`, `choose_stone_color`.

---

## Realtime: WebSocket

### `GET /api/games/{id}/ws` (WebSocket upgrade)

Use this for live play instead of polling. The session cookie identifies you, as with HTTP.

**Server → client** messages:

| `type`         | Payload                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `snapshot`     | `{ game: GameView }`: full state, sent on connect.                                                         |
| `update`       | `{ game }`: a GameView **without `config`**, plus `historyFrom`. `history` holds only entries from `historyFrom` on. Keep your copy of `history[0 … historyFrom)` and replace the rest. |
| `presence`     | `{ users: [{ uuid, name }] }`: who is connected to the game.                                               |
| `action_error` | `{ error }`: your action was rejected (same codes as above, plus `too_many_actions`).                      |

**Client → server**: wrap an action from the table above:

```json
{ "type": "action", "action": { "type": "place", "x": 3, "y": 4 } }
```

The server accepts at most one action per 80 ms per socket.

```js
const ws = new WebSocket(`wss://${location.host}/api/games/${id}/ws`);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "snapshot") game = msg.game;
  if (msg.type === "update") {
    game = { ...game, ...msg.game,
      history: [...game.history.slice(0, msg.game.historyFrom), ...msg.game.history] };
  }
};
ws.send(JSON.stringify({ type: "action", action: { type: "pass" } }));
```

---

## Game links (web client)

These are page URLs, not API endpoints. They are what you give to players.

| URL                                   | What the client does                                                 |
| ------------------------------------- | -------------------------------------------------------------------- |
| `/`                                   | Lobby: game list and create form.                                    |
| `/game/{id}`                          | Opens the game as a spectator (or as the seats this player holds).   |
| `/game/{id}#{seatId}`                 | Opens the game and joins `seatId` if it is free. Use for invites.    |
| `/game/{id}?from=badukclub#{seatId}`  | Same, plus a "← BadukClub" link in the header back to `https://baduk.club/vgs`. |
| `/game/{id}?name={name}#{seatId}`     | Same, and first sets the player's name to `{name}`.                  |

Parameters can be combined: `/game/42?name=Alex&from=badukclub#black`.

About `name`:

- The client sets it with `POST /api/session/name` before the game loads, so the seat shows the
  name from the start. It replaces the player's current name, including one they typed earlier.
- The usual name rules apply: trimmed, cut to 16 characters, profanity-filtered, shown as text.
- The client removes `name` from the address bar after reading it, so shared links don't carry it.
  Each player's own link needs its own `name`.

About `from`:

- Only known source names are accepted. The only one is `badukclub`. Any other value, including a
  URL, is ignored, so `from` cannot redirect players to an arbitrary site.
- The client removes `from` from the address bar after reading it, so links copied afterwards don't
  carry it. It remembers the source for the rest of the browser tab (`sessionStorage`), so the link
  stays while the player moves between the game and the lobby.
- The link is not shown when the page is inside a frame.

---

## Embedding in a frame

The site may be shown in an `<iframe>` only by pages on `variant.baduk.club` itself and on
`https://baduk.club` / `https://*.baduk.club`. Every other site is blocked by the browser
(`Content-Security-Policy: frame-ancestors 'self' https://baduk.club https://*.baduk.club`).

```html
<iframe src="https://variant.baduk.club/game/42#black" allow="autoplay"></iframe>
```

- `baduk.club` and `variant.baduk.club` are the same site, so the `SameSite=Lax` session cookie
  works inside the frame and the player keeps their seat.
- Browsers block sound until the player has interacted with the frame; `allow="autoplay"` helps.
- Links inside the frame (lobby, rules) stay inside the frame.

---

## Limits (hosted server)

The public server at `variant.baduk.club` runs behind nginx, which adds these limits per IP address:

| Limit                         | Value                                                  |
| ----------------------------- | ------------------------------------------------------ |
| `/api/` request rate          | 5 per second, bursts up to 20; above that `503`.       |
| Other requests                | 30 per second, bursts up to 60.                        |
| Open connections              | 20 at once.                                            |
| Request body                  | 1 MB.                                                  |
| HTTP methods                  | `GET`, `HEAD`, `POST` only; others get `405`.          |
| WebSocket actions             | 1 per 80 ms per socket (`too_many_actions`).           |

---

## Game view

The main fields of `GameView` (full type: `Game` in `client/types/domain.ts`):

| Field                         | Meaning                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                          | Game id (numeric string).                                                                     |
| `config`                      | The normalized config.                                                                        |
| `phase`                       | `"joseki"` \| `"hidden"` (setup phases) → `"play"` → `"scoring"` → `"done"`.                  |
| `boardWidth`, `boardHeight`   |                                                                                               |
| `board`                       | Row-major `number[]`, index `y * boardWidth + x`. `0` empty, `-1` removed (custom board), `N` = stone color N (1 = black, 2 = white, 3–4 = further Color Go colors). In Zen, stones alternate 1/2 regardless of which seat plays them. |
| `boardOpacity`                | Hidden/Phantom only: opacity per point for stones only some viewers can see.                  |
| `seats`                       | `[{ id, team, resigned, playerUuid?, publicName?, time? }]`. Empty seats have no `playerUuid`. `time` = `{ mainLeft, periodLeft, periodsLeft }` in seconds. |
| `turn`                        | Index into `seats` of the seat to move.                                                       |
| `points`                      | Score per team.                                                                               |
| `lastStone`                   | Points of the last move.                                                                      |
| `deadStones`, `noScorePoints`, `scoreAccepted` | Scoring phase state.                                                         |
| `winnerTeams`, `endReason`    | Set when the game is done: `"resign"` \| `"timeout"` \| `"score"` \| `"unknown"`.                            |
| `clockUpdatedAt`              | Milliseconds timestamp of the last clock update; count down locally from this.                |
| `josekiSetup`, `hiddenSetup`, `shapeCards` | Variant-specific state, only present when the variant is on.                     |
| `history`                     | `[{ phase, action? }]`, the move list. Get the boards from `/history`.                        |
| `users`                       | Connected viewers `[{ uuid, name }]`.                                                         |

---

## Reference data

| Endpoint                       | Returns                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `GET /api/health`              | `{ "ok": true, "service": "variant-go-server" }`                                    |
| `GET /api/joseki-cards`        | `{ cards: [{ id, name, boardSize, stones: [{ x, y, color }] }] }`                   |
| `GET /api/joseki-cards/{id}`   | `{ card }` or `404 joseki_card_not_found`                                           |
| `GET /api/shape-cards`         | `{ cards: [{ id, name, count, stones: [{ x, y, rel: "self" \| "opponent" }] }] }`   |

---

## Types and client code

TypeScript types for every request and response are in `client/types/domain.ts`.
