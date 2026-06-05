import { Database } from "@db/sqlite";
import type { GameRecord } from "./gameStore.ts";
import type { Seat } from "./engine/types.ts";

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  uuid TEXT PRIMARY KEY,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  phase TEXT NOT NULL,
  board_width INTEGER NOT NULL,
  board_height INTEGER NOT NULL,
  seat_count INTEGER NOT NULL,
  ruleset TEXT NOT NULL,
  config_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
  game_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  player_uuid TEXT,
  team INTEGER NOT NULL,
  resigned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, seat_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

CREATE TABLE IF NOT EXISTS game_events (
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  player_uuid TEXT,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (game_id, seq),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (player_uuid) REFERENCES players(uuid)
);

CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase);
CREATE INDEX IF NOT EXISTS idx_seats_player_uuid ON seats(player_uuid);
`;

type GameRow = {
  snapshot_json: string;
};

type EventSeqRow = {
  seq: number | null;
};

export class SqliteRepository {
  readonly db: Database;

  constructor(path = "baduk.db") {
    this.db = new Database(path);
    this.db.exec(SCHEMA_SQL);
    this.backfillFinishedWinnerTeams();
  }

  close(): void {
    this.db.close();
  }

  savePlayer(uuid: string, name?: string): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO players (uuid, name, created_at, last_seen_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        name = COALESCE(excluded.name, players.name),
        last_seen_at = excluded.last_seen_at
    `).run(uuid, name ?? null, now, now);
  }

  saveGame(record: GameRecord): void {
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO games (
          id, created_at, updated_at, phase, board_width, board_height,
          seat_count, ruleset, config_json, snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          phase = excluded.phase,
          board_width = excluded.board_width,
          board_height = excluded.board_height,
          seat_count = excluded.seat_count,
          ruleset = excluded.ruleset,
          config_json = excluded.config_json,
          snapshot_json = excluded.snapshot_json
      `).run(
        record.id,
        record.createdAt,
        record.updatedAt,
        record.state.phase,
        record.state.boardWidth,
        record.state.boardHeight,
        record.state.seats.length,
        record.config.ruleset,
        JSON.stringify(record.config),
        JSON.stringify(record),
      );

      this.db.prepare("DELETE FROM seats WHERE game_id = ?").run(record.id);
      for (const seat of record.state.seats) this.saveSeat(record.id, seat);
    })();
  }

  getGame(id: string): GameRecord | undefined {
    const row = this.db.prepare("SELECT snapshot_json FROM games WHERE id = ?").get(id) as
      | GameRow
      | undefined;
    return row ? JSON.parse(row.snapshot_json) as GameRecord : undefined;
  }

  listGames(): GameRecord[] {
    const rows = this.db.prepare(
      "SELECT snapshot_json FROM games ORDER BY CAST(id AS INTEGER) DESC",
    )
      .all() as GameRow[];
    return rows.map((row) => JSON.parse(row.snapshot_json) as GameRecord);
  }

  appendEvent(
    gameId: string,
    playerUuid: string | undefined,
    eventType: string,
    event: unknown,
  ): number {
    const row = this.db.prepare("SELECT MAX(seq) AS seq FROM game_events WHERE game_id = ?").get(
      gameId,
    ) as EventSeqRow;
    const seq = (row.seq ?? 0) + 1;
    if (playerUuid) this.savePlayer(playerUuid);
    this.db.prepare(`
      INSERT INTO game_events (game_id, seq, created_at, player_uuid, event_type, event_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(gameId, seq, Date.now(), playerUuid ?? null, eventType, JSON.stringify(event));
    return seq;
  }

  private saveSeat(gameId: string, seat: Seat): void {
    if (seat.playerUuid) this.savePlayer(seat.playerUuid);
    this.db.prepare(`
      INSERT INTO seats (game_id, seat_id, player_uuid, team, resigned)
      VALUES (?, ?, ?, ?, ?)
    `).run(gameId, seat.id, seat.playerUuid ?? null, seat.team, seat.resigned ? 1 : 0);
  }

  private backfillFinishedWinnerTeams(): void {
    const rows = this.db.prepare("SELECT snapshot_json FROM games WHERE phase = 'done'")
      .all() as GameRow[];
    const updates: GameRecord[] = [];
    for (const row of rows) {
      const record = JSON.parse(row.snapshot_json) as GameRecord;
      if (record.state.play.winnerTeams?.length) continue;
      const winnerTeams = inferFinishedWinnerTeams(record.state.seats);
      if (winnerTeams.length === 0) continue;
      record.state.play.winnerTeams = winnerTeams;
      updates.push(record);
    }
    if (updates.length === 0) return;

    this.db.transaction(() => {
      const updateGame = this.db.prepare(
        "UPDATE games SET snapshot_json = ? WHERE id = ?",
      );
      for (const record of updates) updateGame.run(JSON.stringify(record), record.id);
    })();
  }
}

function inferFinishedWinnerTeams(seats: Seat[]): number[] {
  const activeTeams = [...new Set(seats.filter((seat) => !seat.resigned).map((seat) => seat.team))];
  return activeTeams.length === 1 ? activeTeams : [];
}
