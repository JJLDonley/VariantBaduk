import { DEFAULT_CONFIG, normalizeConfig } from "./configValidation.ts";
import { Board, findGroups } from "./engine/board.ts";
import { captureDeadOpponents } from "./engine/capture.ts";
import { createGame, makeAction } from "./engine/game.ts";
import { pushHistory } from "./engine/state.ts";
import { advanceTurn } from "./engine/turn.ts";
import { placementPoints } from "./engine/variants/pixel.ts";
import type {
  ActionKind,
  JosekiPlacement,
  MakeActionError,
  Seat,
  SharedState,
} from "./engine/types.ts";
import { transformJosekiCard } from "./engine/variants/josekiCard.ts";
import { listJosekiCardsSync } from "./josekiCards.ts";
import { sanitizePublicName } from "./profanity.ts";

export { normalizeConfig } from "./configValidation.ts";

export type TimeConfig = {
  system: "none" | "byoyomi" | "fischer";
  main: number;
  periods: number;
  periodTime: number;
  fischerIncrement: number;
};

export type GameConfig = {
  boardSize: number;
  name?: string;
  customGoban?: {
    width: number;
    height: number;
    points: number[];
    starPoints?: Array<{ x: number; y: number }>;
  };
  ruleset: "area" | "territory" | "chinese" | "aga" | "japanese";
  komi?: number;
  handicap?: number;
  time?: TimeConfig;
  creatorSeat?: string;
  variants: {
    capturesGivePoints: boolean;
    ponnukiPointValue?: number;
    pixel?: boolean;
    zen?: boolean;
    zenPlayerCount?: number;
    colorGo?: boolean;
    colorGoPlayerCount?: number;
    colorGoColors?: string[];
    colorGoKomi?: number[];
    phantomMove?: boolean;
    phantomHideViewers?: boolean;
    hiddenMove?: boolean;
    hiddenMoveCount?: number;
    hiddenMoveShowViewers?: boolean;
    josekiCard?: boolean;
    tetris?: boolean;
    nPlusOne: boolean;
    nPlusOneCount?: number;
    traitor: boolean;
    traitorMode?: "moves" | "percentage";
    traitorStoneCount?: number;
    traitorChance?: number;
    showTraitorCounter?: boolean;
    randomTurn?: boolean;
    teamGo?: boolean;
    teamGoSeatCounts?: number[];
  };
};

export type GameRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  config: GameConfig;
  state: SharedState;
};

export type ClientGameView = {
  id: string;
  config: GameConfig;
  phase: SharedState["phase"];
  boardWidth: number;
  boardHeight: number;
  board: number[];
  boardOpacity?: number[];
  seats: Seat[];
  turn: number;
  points: number[];
  lastStone?: { x: number; y: number }[];
  playMoves?: number;
  captureCount?: number;
  traitorStonesPlaced?: number[];
  deadStones?: boolean[];
  noScorePoints?: boolean[];
  scoreAccepted?: boolean[];
  winnerTeams?: number[];
  endReason?: "resign" | "timeout" | "score";
  clockUpdatedAt?: number;
  josekiSetup?: SharedState["josekiSetup"];
  hiddenSetup?: SharedState["hiddenSetup"];
  history?: {
    board: number[];
    boardOpacity?: number[];
    phase: SharedState["phase"];
    action?: "place" | "placeHidden" | "pass" | "resign";
  }[];
};

export type GameRepository = {
  saveGame(record: GameRecord): void;
  getGame(id: string): GameRecord | undefined;
  listGames(): GameRecord[];
  appendEvent(
    gameId: string,
    playerUuid: string | undefined,
    eventType: string,
    event: unknown,
  ): number;
};

export class GameStore {
  readonly records = new Map<string, GameRecord>();
  private readonly playerNames = new Map<string, string>();
  private nextId = 1;

  constructor(
    private readonly repository?: GameRepository,
    private readonly now = () => Date.now(),
  ) {
    for (const record of repository?.listGames() ?? []) {
      let changed = false;
      const safeName = sanitizePublicName(record.config.name, "", 32);
      if (!safeName || safeName === "Game") {
        record.config.name = defaultGameName(record.id);
        changed = true;
      } else if (safeName !== record.config.name) {
        record.config.name = safeName;
        changed = true;
      }
      this.records.set(record.id, record);
      if (changed) repository?.saveGame(record);
      const numericId = Number(record.id);
      if (Number.isInteger(numericId) && numericId >= this.nextId) this.nextId = numericId + 1;
    }
  }

  create(config: Partial<GameConfig> = {}, playerUuid?: string): GameRecord {
    const normalized = normalizeConfig(config);
    const id = String(this.nextId++);
    normalized.name ||= defaultGameName(id);
    const now = this.now();
    const playerCount = normalized.variants.colorGo
      ? normalized.variants.colorGoPlayerCount ?? 3
      : normalized.variants.zen
      ? normalized.variants.zenPlayerCount ?? 3
      : undefined;
    const seats = normalized.variants.teamGo
      ? teamGoSeats(normalized.variants.teamGoSeatCounts ?? [2, 2])
      : playerCount
      ? Array.from({ length: playerCount }, (_, index) => ({
        id: `player-${index + 1}`,
        team: index + 1,
        resigned: false,
      }))
      : undefined;
    const state = createGame({
      width: normalized.customGoban?.width ?? normalized.boardSize,
      height: normalized.customGoban?.height,
      points: normalized.customGoban?.points,
      id,
      handicap: normalized.customGoban || normalized.ruleset === "chinese"
        ? 0
        : normalized.handicap ?? 0,
      seats,
      phantomMove: normalized.variants.phantomMove || normalized.variants.hiddenMove,
    });
    initializeSeatClocks(state.seats, normalized);
    if (playerUuid && (normalized.creatorSeat ?? "black") !== "none") {
      const seatIndex = creatorSeatIndex(normalized.creatorSeat, state.seats);
      state.seats[seatIndex].playerUuid = playerUuid;
      state.seats[seatIndex].publicName = this.getPlayerName(playerUuid);
    }
    const record = { id, createdAt: now, updatedAt: now, config: normalized, state };
    this.records.set(id, record);
    this.repository?.saveGame(record);
    this.repository?.appendEvent(id, playerUuid, "game_created", { config: normalized });
    return record;
  }

  get(id: string): GameRecord | undefined {
    const record = this.records.get(id);
    if (record) this.refreshClock(record);
    return record;
  }

  list(): GameRecord[] {
    for (const record of this.records.values()) this.refreshClock(record);
    return [...this.records.values()].sort((a, b) => Number(b.id) - Number(a.id));
  }

  joinSeat(gameId: string, seatId: string, playerUuid: string): GameRecord | undefined {
    const record = this.records.get(gameId);
    if (!record) return undefined;
    this.refreshClock(record);
    const seat = record.state.seats.find((seat) => seat.id === seatId);
    if (!seat || record.state.phase !== "play") return undefined;
    if (seat.playerUuid && seat.playerUuid !== playerUuid) return undefined;
    seat.playerUuid = playerUuid;
    seat.publicName = this.getPlayerName(playerUuid);
    record.updatedAt = this.now();
    startPregameSetupIfReady(record, record.updatedAt);
    startClockIfReady(record, record.updatedAt);
    this.repository?.saveGame(record);
    this.repository?.appendEvent(gameId, playerUuid, "seat_joined", { seatId });
    return record;
  }

  leaveSeat(gameId: string, seatId: string, playerUuid: string): GameRecord | undefined {
    const record = this.records.get(gameId);
    if (!record) return undefined;
    this.refreshClock(record);
    const seat = record.state.seats.find((seat) => seat.id === seatId);
    if (!seat || seat.playerUuid !== playerUuid || record.state.phase !== "play") return undefined;
    seat.playerUuid = undefined;
    seat.publicName = undefined;
    record.state.clockUpdatedAt = undefined;
    record.updatedAt = this.now();
    this.repository?.saveGame(record);
    this.repository?.appendEvent(gameId, playerUuid, "seat_left", { seatId });
    return record;
  }

  getPlayerName(playerUuid: string): string {
    return this.playerNames.get(playerUuid) ?? randomName(playerUuid);
  }

  setPlayerName(playerUuid: string, name: string): void {
    const normalized = name.trim().slice(0, 16);
    if (normalized) this.playerNames.set(playerUuid, normalized);
    else this.playerNames.delete(playerUuid);

    for (const record of this.records.values()) {
      let changed = false;
      for (const seat of record.state.seats) {
        if (seat.playerUuid === playerUuid) {
          seat.publicName = this.getPlayerName(playerUuid);
          changed = true;
        }
      }
      if (changed) {
        record.updatedAt = this.now();
        this.repository?.saveGame(record);
      }
    }
  }

  applyAction(
    gameId: string,
    playerUuid: string,
    action: ActionKind,
  ): { ok: true; record: GameRecord } | { ok: false; error: MakeActionError | "game_not_found" } {
    const record = this.records.get(gameId);
    if (!record) return { ok: false, error: "game_not_found" };
    this.refreshClock(record);
    if (record.state.phase === "joseki") return this.applyJosekiAction(record, playerUuid, action);
    if (record.state.phase === "hidden") return this.applyHiddenAction(record, playerUuid, action);
    if (record.state.phase !== "play" && record.state.phase !== "scoring") {
      return { ok: false, error: "illegal" };
    }

    ensureSeatClocks(record.state.seats, record.config);
    const actionStartedAt = record.state.clockUpdatedAt;
    const activeSeatIndex = record.state.turn;
    const result = makeAction(record.state, playerUuid, action, {
      ...record.config.variants,
      komi: record.config.komi,
      scoring: ["japanese", "territory"].includes(record.config.ruleset) ? "territory" : "area",
      freeHandicapCount: record.config.ruleset === "chinese" ? record.config.handicap : undefined,
    });
    if (!result.ok) {
      if (result.state) {
        record.state = result.state;
        record.updatedAt = this.now();
        this.repository?.saveGame(record);
        this.repository?.appendEvent(gameId, playerUuid, action.type, {
          ...action,
          error: result.error,
        });
      }
      return result;
    }

    if (action.type === "place") removeHiddenClaimAt(result.state, action.point);
    const now = this.now();
    if (actionStartedAt !== undefined) {
      applyTeamClockElapsed(
        result.state,
        activeSeatIndex,
        record.config,
        (now - actionStartedAt) / 1000,
      );
    }
    result.state.clockUpdatedAt = result.state.phase === "play" && allSeatsOccupied(result.state) &&
        clocksEnabled(record.config)
      ? now
      : undefined;
    record.state = result.state;
    record.updatedAt = now;
    this.repository?.saveGame(record);
    this.repository?.appendEvent(gameId, playerUuid, action.type, action);
    return { ok: true, record };
  }

  private applyJosekiAction(
    record: GameRecord,
    playerUuid: string,
    action: ActionKind,
  ): { ok: true; record: GameRecord } | { ok: false; error: MakeActionError | "game_not_found" } {
    advanceJosekiSelectionIfTimedOut(record, this.now());
    const setup = record.state.josekiSetup;
    const seat = record.state.seats.find((seat) => seat.playerUuid === playerUuid);
    if (!setup || !seat) return { ok: false, error: "illegal" };
    if (action.type === "selectJosekiCards" && setup.phase === "select") {
      const ownedSetups = josekiSetupsForPlayer(record, playerUuid);
      if (ownedSetups.length === 0) return { ok: false, error: "illegal" };
      const requiredCount = ownedSetups.length * 2;
      const allowed = new Set(setup.availableCards.map((card) => card.id));
      const selected = [...new Set(action.cardIds)].filter((id) => allowed.has(id)).slice(
        0,
        requiredCount,
      );
      for (let index = 0; index < ownedSetups.length; index++) {
        ownedSetups[index].selectedCardIds = selected.slice(index * 2, index * 2 + 2);
        ownedSetups[index].confirmedSelection = selected.length === requiredCount;
      }
      if (setup.seats.every((entry) => entry.confirmedSelection)) beginJosekiPlacement(record);
      return this.saveJosekiAction(record, playerUuid, action);
    }
    if (action.type === "confirmJosekiSelection" && setup.phase === "select") {
      const ownedSetups = josekiSetupsForPlayer(record, playerUuid);
      if (
        ownedSetups.length === 0 || ownedSetups.some((entry) => entry.selectedCardIds.length !== 2)
      ) {
        return { ok: false, error: "illegal" };
      }
      for (const seatSetup of ownedSetups) seatSetup.confirmedSelection = true;
      if (setup.seats.every((entry) => entry.confirmedSelection)) beginJosekiPlacement(record);
      return this.saveJosekiAction(record, playerUuid, action);
    }
    const activePlacementSeat = record.state.seats.find((seat) =>
      seat.id === setup.placementOrder[setup.placementIndex]
    );
    if (setup.phase !== "place" || activePlacementSeat?.playerUuid !== playerUuid) {
      return { ok: false, error: "not_turn" };
    }
    if (action.type === "updateJosekiPlacement") {
      const placement = normalizeJosekiPlacement({
        ...setup.currentPlacement,
        ...action.placement,
      });
      setup.currentPlacement = setup.placedCorners.includes(placement.corner)
        ? { ...placement, corner: firstAvailableJosekiCorner(setup.placedCorners) }
        : placement;
      return this.saveJosekiAction(record, playerUuid, action);
    }
    if (action.type === "confirmJosekiPlacement") {
      const normalizedPlacement = normalizeJosekiPlacement(setup.currentPlacement);
      const placement = setup.placedCorners.includes(normalizedPlacement.corner)
        ? { ...normalizedPlacement, corner: firstAvailableJosekiCorner(setup.placedCorners) }
        : normalizedPlacement;
      const placed = placeJoseki(record, placement);
      if (!placed) return { ok: false, error: "illegal" };
      setup.placedCorners.push(placement.corner);
      setup.placementIndex++;
      setup.currentPlacement = undefined;
      if (setup.placementIndex >= setup.placementOrder.length) finishJosekiSetup(record);
      else setup.currentPlacement = defaultJosekiPlacement(record);
      return this.saveJosekiAction(record, playerUuid, action);
    }
    return { ok: false, error: "illegal" };
  }

  private applyHiddenAction(
    record: GameRecord,
    playerUuid: string,
    action: ActionKind,
  ): { ok: true; record: GameRecord } | { ok: false; error: MakeActionError | "game_not_found" } {
    const setup = record.state.hiddenSetup;
    const seat = record.state.seats.find((seat) => seat.playerUuid === playerUuid);
    if (!setup || !seat || action.type !== "placeHidden") return { ok: false, error: "illegal" };
    const seatSetup = setup.seats.find((entry) => entry.seatId === seat.id);
    if (!seatSetup) return { ok: false, error: "illegal" };
    const point = action.point;
    const board = Board.from(record.state.boardWidth, record.state.boardHeight, record.state.board);
    const points = placementPoints(board, point, { pixel: record.config.variants.pixel });
    if (points.length === 0) return { ok: false, error: "out_of_bounds" };
    const emptyPoints = points.filter((point) => board.get(point) === 0);
    seatSetup.placements ??= seatSetup.points.map((point) => ({ origin: point, points: [point] }));
    const existingIndex = seatSetup.placements.findIndex((placement) =>
      placement.origin.x === point.x && placement.origin.y === point.y
    );
    if (existingIndex >= 0) {
      seatSetup.placements.splice(existingIndex, 1);
    } else if (emptyPoints.length === 0) {
      return { ok: false, error: "point_occupied" };
    } else if (seatSetup.placements.length < setup.stonesPerPlayer) {
      seatSetup.placements.push({ origin: point, points: emptyPoints });
    } else return { ok: false, error: "illegal" };
    seatSetup.points = seatSetup.placements.flatMap((placement) => placement.points);
    pushHistory(
      record.state,
      board,
      "placeHidden",
    );
    if (setup.seats.every((entry) => hiddenPlacementCount(entry) >= setup.stonesPerPlayer)) {
      finishHiddenSetup(record);
    }
    return this.saveSetupAction(record, playerUuid, action);
  }

  private saveJosekiAction(
    record: GameRecord,
    playerUuid: string,
    action: ActionKind,
  ): { ok: true; record: GameRecord } {
    record.updatedAt = this.now();
    this.repository?.saveGame(record);
    this.repository?.appendEvent(record.id, playerUuid, action.type, action);
    return { ok: true, record };
  }

  private saveSetupAction(
    record: GameRecord,
    playerUuid: string,
    action: ActionKind,
  ): { ok: true; record: GameRecord } {
    record.updatedAt = this.now();
    this.repository?.saveGame(record);
    this.repository?.appendEvent(record.id, playerUuid, action.type, action);
    return { ok: true, record };
  }

  private refreshClock(record: GameRecord): void {
    const now = this.now();
    if (record.state.phase === "joseki") {
      advanceJosekiSelectionIfTimedOut(record, now);
      return;
    }
    const timedOutSeat = markTimedOut(record, now);
    if (!timedOutSeat) return;
    record.updatedAt = now;
    this.repository?.saveGame(record);
    this.repository?.appendEvent(
      record.id,
      timedOutSeat.playerUuid,
      "timeout",
      {
        seatId: timedOutSeat.id,
        team: timedOutSeat.team,
      },
    );
  }
}

export function toClientGameView(record: GameRecord, viewerUuid?: string): ClientGameView {
  const { board, boardOpacity } = visibleBoard(record, viewerUuid);
  return {
    id: record.id,
    config: record.config,
    phase: record.state.phase,
    boardWidth: record.state.boardWidth,
    boardHeight: record.state.boardHeight,
    board,
    ...(boardOpacity ? { boardOpacity } : {}),
    seats: record.state.seats,
    turn: record.state.turn,
    points: record.state.points,
    lastStone: record.state.play.lastStone,
    playMoves: record.state.play.movesPlayed,
    captureCount: record.state.play.captureCount,
    traitorStonesPlaced: record.state.play.traitorStonesPlaced,
    deadStones: record.state.play.deadStones,
    noScorePoints: record.state.play.noScorePoints,
    scoreAccepted: record.state.play.scoreAccepted,
    winnerTeams: record.state.play.winnerTeams,
    endReason: record.state.play.endReason,
    clockUpdatedAt: record.state.clockUpdatedAt,
    josekiSetup: record.state.josekiSetup,
    hiddenSetup: record.state.hiddenSetup,
    history: record.state.history.map((history) => {
      const view = visibleBoard(
        record,
        viewerUuid,
        history.board,
        history.play,
        true,
        history.hiddenSetup ??
          (history.action === "placeHidden" ? record.state.hiddenSetup : undefined),
      );
      return {
        board: view.board,
        ...(view.boardOpacity ? { boardOpacity: view.boardOpacity } : {}),
        phase: history.phase,
        action: history.action,
      };
    }),
  };
}

function visibleBoard(
  record: GameRecord,
  viewerUuid?: string,
  sourceBoard = record.state.board,
  sourcePlay = record.state.play,
  reviewMode = false,
  sourceHiddenSetup?: SharedState["hiddenSetup"],
): { board: number[]; boardOpacity?: number[] } {
  const sourceIsLive = sourceBoard === record.state.board && sourcePlay === record.state.play;
  const effectiveHiddenSetup = sourceHiddenSetup ??
    (sourceIsLive ? record.state.hiddenSetup : undefined);
  if (!record.config.variants.phantomMove && !record.config.variants.hiddenMove) {
    return hiddenSetupVisibleBoard(
      record,
      viewerUuid,
      sourceBoard,
      sourceIsLive,
      undefined,
      effectiveHiddenSetup,
      reviewMode,
    );
  }
  const owners = sourcePlay.phantomOwners ?? [];
  const revealed = sourcePlay.phantomRevealed ?? [];
  const viewerSeat = reviewMode || record.state.phase === "done"
    ? undefined
    : record.state.seats.find((seat) => seat.playerUuid === viewerUuid);
  const isPlayer = Boolean(viewerSeat);
  const board = [...sourceBoard];
  const boardOpacity = Array(board.length).fill(1);
  for (let index = 0; index < board.length; index++) {
    if (board[index] <= 0) continue;
    if ((owners[index] ?? 0) <= 0) continue;
    if (revealed[index]) continue;
    if (isPlayer) {
      if (owners[index] === viewerSeat?.team) boardOpacity[index] = 0.45;
      else board[index] = 0;
    } else if (
      record.config.variants.phantomHideViewers ||
      (record.config.variants.hiddenMove && !record.config.variants.hiddenMoveShowViewers)
    ) {
      board[index] = 0;
    } else {
      boardOpacity[index] = 0.45;
    }
  }
  return hiddenSetupVisibleBoard(
    record,
    viewerUuid,
    board,
    sourceIsLive,
    boardOpacity,
    effectiveHiddenSetup,
    reviewMode,
  );
}

function hiddenSetupVisibleBoard(
  record: GameRecord,
  viewerUuid: string | undefined,
  sourceBoard: number[],
  sourceIsLive: boolean,
  sourceOpacity?: number[],
  setup?: SharedState["hiddenSetup"],
  reviewMode = false,
): { board: number[]; boardOpacity?: number[] } {
  if (!setup || (record.state.phase === "done" && !reviewMode)) {
    return sourceOpacity
      ? { board: sourceBoard, boardOpacity: sourceOpacity }
      : { board: sourceBoard };
  }
  const viewerSeat = record.state.seats.find((seat) => seat.playerUuid === viewerUuid);
  const canSeeAll = reviewMode || (setup.visibility === "viewers" && !viewerSeat);
  if (!viewerSeat && !canSeeAll) {
    return sourceOpacity
      ? { board: sourceBoard, boardOpacity: sourceOpacity }
      : { board: sourceBoard };
  }
  const board = [...sourceBoard];
  const boardOpacity = sourceOpacity ? [...sourceOpacity] : Array(board.length).fill(1);
  const hiddenTeamsByIndex = new Map<number, Set<number>>();
  for (const seatSetup of setup.seats) {
    const seat = record.state.seats.find((seat) => seat.id === seatSetup.seatId);
    if (!seat || (!canSeeAll && seat.id !== viewerSeat?.id)) continue;
    for (const point of seatSetup.points) {
      const index = point.y * record.state.boardWidth + point.x;
      const teams = hiddenTeamsByIndex.get(index) ?? new Set<number>();
      teams.add(seat.team);
      hiddenTeamsByIndex.set(index, teams);
    }
  }
  for (const [index, teams] of hiddenTeamsByIndex) {
    if (board[index] !== 0) continue;
    board[index] = reviewMode && teams.size > 1 ? 99 : [...teams][0];
    boardOpacity[index] = 0.45;
  }
  return { board, boardOpacity };
}

function josekiSetupsForPlayer(record: GameRecord, playerUuid: string) {
  const setup = record.state.josekiSetup;
  if (!setup) return [];
  const ownedSeatIds = new Set(
    record.state.seats.filter((seat) => seat.playerUuid === playerUuid).map((seat) => seat.id),
  );
  return setup.seats.filter((entry) => ownedSeatIds.has(entry.seatId));
}

function hiddenPlacementCount(entry: { points: unknown[]; placements?: unknown[] }): number {
  return entry.placements?.length ?? entry.points.length;
}

function startPregameSetupIfReady(record: GameRecord, now: number): void {
  startJosekiSetupIfReady(record, now);
  if (record.state.phase === "play") startHiddenSetupIfReady(record, now);
}

function startJosekiSetupIfReady(record: GameRecord, now: number): void {
  if (
    !record.config.variants.josekiCard || record.state.phase !== "play" || record.state.josekiSetup
  ) return;
  if (!allSeatsOccupied(record.state)) return;
  const cards = listJosekiCardsSync();
  record.state.phase = "joseki";
  record.state.clockUpdatedAt = undefined;
  record.state.josekiSetup = {
    phase: "select",
    selectionStartedAt: now,
    selectionDeadlineAt: now + 60_000,
    availableCards: cards.map(({ id, name, boardSize, stones }) => ({
      id,
      name,
      boardSize,
      stones,
    })),
    seats: record.state.seats.map((seat) => ({
      seatId: seat.id,
      selectedCardIds: [],
      confirmedSelection: false,
    })),
    placementOrder: [],
    placementIndex: 0,
    placedCorners: [],
  };
}

function startHiddenSetupIfReady(record: GameRecord, _now: number): void {
  if (
    !record.config.variants.hiddenMove || record.state.phase !== "play" || record.state.hiddenSetup
  ) {
    return;
  }
  if (!allSeatsOccupied(record.state)) return;
  record.state.phase = "hidden";
  record.state.clockUpdatedAt = undefined;
  record.state.hiddenSetup = {
    stonesPerPlayer: record.config.variants.hiddenMoveCount ?? 3,
    visibility: record.config.variants.hiddenMoveShowViewers ? "viewers" : "players",
    seats: record.state.seats.map((seat) => ({ seatId: seat.id, points: [], placements: [] })),
  };
}

function advanceJosekiSelectionIfTimedOut(record: GameRecord, now: number): void {
  const setup = record.state.josekiSetup;
  if (!setup || setup.phase !== "select" || now < setup.selectionDeadlineAt) return;
  const available = setup.availableCards.map((card) => card.id);
  for (const seatSetup of setup.seats) {
    while (seatSetup.selectedCardIds.length < 2 && available.length > 0) {
      const index = Math.floor(
        seedRandom(
          `${record.state.play.rngSeed}:${seatSetup.seatId}:${seatSetup.selectedCardIds.length}`,
        ) * available.length,
      );
      const cardId = available[index];
      if (!seatSetup.selectedCardIds.includes(cardId)) seatSetup.selectedCardIds.push(cardId);
      else available.splice(index, 1);
    }
    seatSetup.confirmedSelection = seatSetup.selectedCardIds.length === 2;
  }
  beginJosekiPlacement(record);
}

function beginJosekiPlacement(record: GameRecord): void {
  const setup = record.state.josekiSetup;
  if (!setup) return;
  setup.phase = "place";
  const [first, second] = record.state.seats;
  setup.placementOrder = [first?.id, second?.id, first?.id, second?.id].filter(Boolean) as string[];
  setup.placementIndex = 0;
  setup.currentPlacement = defaultJosekiPlacement(record);
}

function firstAvailableJosekiCorner(
  placedCorners: JosekiPlacement["corner"][],
): JosekiPlacement["corner"] {
  return (["upper-left", "upper-right", "lower-right", "lower-left"] as const)
    .find((corner) => !placedCorners.includes(corner)) ?? "upper-right";
}

function defaultJosekiPlacement(record: GameRecord): JosekiPlacement {
  const setup = record.state.josekiSetup!;
  const seatId = setup.placementOrder[setup.placementIndex];
  const usedBySeat =
    setup.placementOrder.slice(0, setup.placementIndex).filter((id) => id === seatId).length;
  const cardId =
    setup.seats.find((entry) => entry.seatId === seatId)?.selectedCardIds[usedBySeat] ??
      setup.availableCards[0]?.id ?? "";
  const corner = firstAvailableJosekiCorner(setup.placedCorners);
  return { cardId, corner, rotate: 0, flipX: false, swapColors: false };
}

function normalizeJosekiPlacement(input: Partial<JosekiPlacement> | undefined): JosekiPlacement {
  const rotate = [0, 90, 180, 270].includes(Number(input?.rotate))
    ? Number(input?.rotate) as JosekiPlacement["rotate"]
    : 0;
  const corner =
    ["upper-left", "upper-right", "lower-left", "lower-right"].includes(String(input?.corner))
      ? input!.corner!
      : "upper-right";
  return {
    cardId: String(input?.cardId ?? ""),
    corner,
    rotate,
    flipX: Boolean(input?.flipX),
    swapColors: Boolean(input?.swapColors),
  };
}

function placeJoseki(record: GameRecord, placement: JosekiPlacement): boolean {
  const card = listJosekiCardsSync().find((card) => card.id === placement.cardId);
  if (!card) return false;
  const stones = transformJosekiCard(card, { ...placement, flipY: false });
  let board = Board.from(record.state.boardWidth, record.state.boardHeight, record.state.board);
  const points = [...record.state.points];
  const capturedStones = [...record.state.play.capturedStones];
  const pointCount = record.state.boardWidth * record.state.boardHeight;
  const trackPhantom = record.config.variants.phantomMove;
  const phantomOwners = trackPhantom
    ? [...(record.state.play.phantomOwners ?? Array(pointCount).fill(0))]
    : undefined;
  const phantomRevealed = trackPhantom
    ? [...(record.state.play.phantomRevealed ?? Array(pointCount).fill(false))]
    : undefined;
  let captureCount = record.state.play.captureCount;

  for (const stone of stones) {
    if (!board.playable(stone) || board.get(stone) !== 0 || stone.color <= 0) continue;
    const nextBoard = board.clone();
    nextBoard.set(stone, stone.color);
    const capturedGroups = captureDeadOpponents(nextBoard, stone.color);
    const captured = capturedGroups.reduce((total, group) => total + group.points.length, 0);
    const ownDead = findGroups(nextBoard).some((group) =>
      group.color === stone.color && group.liberties === 0
    );
    if (ownDead) continue;

    board = nextBoard;
    const index = stone.y * record.state.boardWidth + stone.x;
    if (trackPhantom && phantomOwners && phantomRevealed) {
      phantomOwners[index] = stone.color;
      phantomRevealed[index] = false;
    }
    if (captured > 0) {
      capturedStones[stone.color - 1] = (capturedStones[stone.color - 1] ?? 0) + captured;
      captureCount += captured;
      if (record.config.variants.capturesGivePoints) points[stone.color - 1] += captured * 2;
      const ponnuki = record.config.variants.ponnukiPointValue ?? 0;
      if (ponnuki) {
        points[stone.color - 1] += capturedGroups.filter((group) => group.points.length === 1)
          .length * ponnuki;
      }
      if (trackPhantom && phantomOwners && phantomRevealed) {
        for (const capturedPoint of capturedGroups.flatMap((group) => group.points)) {
          const capturedIndex = capturedPoint.y * record.state.boardWidth + capturedPoint.x;
          phantomOwners[capturedIndex] = 0;
          phantomRevealed[capturedIndex] = false;
        }
      }
    }
  }

  record.state.board = board.points;
  record.state.points = points;
  record.state.play.capturedStones = capturedStones;
  record.state.play.captureCount = captureCount;
  if (trackPhantom && phantomOwners && phantomRevealed) {
    record.state.play.phantomOwners = phantomOwners;
    record.state.play.phantomRevealed = phantomRevealed;
  }
  record.state.history.push({
    hash: board.hash(),
    board: [...record.state.board],
    points: [...record.state.points],
    turn: record.state.turn,
    phase: record.state.phase,
    action: "place",
    play: structuredClone(record.state.play),
  });
  return true;
}

function finishHiddenSetup(record: GameRecord): void {
  const setup = record.state.hiddenSetup;
  if (!setup) return;
  const pointCount = record.state.boardWidth * record.state.boardHeight;
  const claims = Array.from({ length: pointCount }, () => new Set<number>());
  for (const seatSetup of setup.seats) {
    const seat = record.state.seats.find((seat) => seat.id === seatSetup.seatId);
    if (!seat) continue;
    for (const point of seatSetup.points) {
      claims[point.y * record.state.boardWidth + point.x].add(seat.team);
    }
  }
  record.state.play.phantomOwners ??= Array(pointCount).fill(0);
  record.state.play.phantomRevealed ??= Array(pointCount).fill(false);
  for (let index = 0; index < claims.length; index++) {
    if (claims[index].size !== 1) continue;
    const team = [...claims[index]][0];
    record.state.board[index] = team;
    record.state.play.phantomOwners[index] = team;
    record.state.play.phantomRevealed[index] = false;
  }
  record.state.turn = 0;
  record.state.phase = "play";
  record.state.clockUpdatedAt = clocksEnabled(record.config) ? Date.now() : undefined;
}

function finishJosekiSetup(record: GameRecord): void {
  const black = record.state.board.filter((color) => color === 1).length;
  const white = record.state.board.filter((color) => color === 2).length;
  record.state.turn = black <= white ? 0 : 1;
  record.state.phase = "play";
  record.state.josekiSetup = undefined;
  startHiddenSetupIfReady(record, Date.now());
  if (record.state.phase === "play") {
    record.state.clockUpdatedAt = clocksEnabled(record.config) ? Date.now() : undefined;
    pushHistory(
      record.state,
      Board.from(record.state.boardWidth, record.state.boardHeight, record.state.board),
    );
  }
}

function seedRandom(seed: string): number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) value = Math.imul(value ^ seed.charCodeAt(i), 16777619);
  return ((value >>> 0) % 1_000_000) / 1_000_000;
}

function initializeSeatClocks(seats: Seat[], config: GameConfig): void {
  if (!clocksEnabled(config)) return;
  for (const seat of seats) {
    seat.time = initialSeatTime(config.time);
  }
}

function ensureSeatClocks(seats: Seat[], config: GameConfig): void {
  if (!clocksEnabled(config)) return;
  for (const seat of seats) seat.time ??= initialSeatTime(config.time);
}

function initialSeatTime(time: TimeConfig | undefined) {
  return {
    mainLeft: time?.main ?? 0,
    periodLeft: time?.periodTime ?? 0,
    periodsLeft: time?.periods ?? 0,
  };
}

function clocksEnabled(config: GameConfig): boolean {
  return Boolean(config.time && config.time.system !== "none" && !config.variants?.zen);
}

function startClockIfReady(record: GameRecord, now: number): void {
  ensureSeatClocks(record.state.seats, record.config);
  if (
    clocksEnabled(record.config) && record.state.phase === "play" && allSeatsOccupied(record.state)
  ) {
    record.state.clockUpdatedAt ??= now;
  }
}

function allSeatsOccupied(state: SharedState): boolean {
  return state.seats.every((seat) => seat.playerUuid);
}

function markTimedOut(record: GameRecord, now: number): Seat | undefined {
  const state = record.state;
  const time = record.config.time;
  if (
    !clocksEnabled(record.config) || !time || state.phase !== "play" ||
    state.clockUpdatedAt === undefined
  ) return undefined;
  const activeSeat = state.seats[state.turn];
  if (!activeSeat?.time) return undefined;
  const elapsed = (now - state.clockUpdatedAt) / 1000;
  if (elapsed < clockSecondsUntilLoss(activeSeat, time) + 1) return undefined;

  applyTeamClockElapsed(state, state.turn, record.config, elapsed, false);
  for (const seat of state.seats) if (seat.team === activeSeat.team) seat.resigned = true;
  const remainingTeams = activeTeamIds(state.seats);
  if (remainingTeams.length <= 1) {
    state.phase = "done";
    state.play.winnerTeams = remainingTeams;
    state.play.endReason = "timeout";
    state.clockUpdatedAt = undefined;
  } else {
    state.play.extraTurnsRemaining = 0;
    advanceTurn(state, false, record.config.variants);
    state.clockUpdatedAt = now;
  }
  return activeSeat;
}

function activeTeamIds(seats: Seat[]): number[] {
  return [...new Set(seats.filter((seat) => !seat.resigned).map((seat) => seat.team))];
}

function clockSecondsUntilLoss(seat: Seat, time: TimeConfig): number {
  if (!seat.time) return 0;
  if (time.system === "fischer") return seat.time.mainLeft;
  const periodTime = time.periodTime ?? 0;
  return seat.time.mainLeft + seat.time.periodLeft +
    Math.max(0, seat.time.periodsLeft - 1) * periodTime;
}

function applyTeamClockElapsed(
  state: SharedState,
  activeSeatIndex: number,
  config: GameConfig,
  elapsedSeconds: number,
  addIncrement = true,
): void {
  const time = config.time;
  const activeSeat = state.seats[activeSeatIndex];
  if (!time || !activeSeat) return;
  applyClockElapsed(activeSeat, time, elapsedSeconds, addIncrement);
  for (const seat of state.seats) {
    if (seat !== activeSeat && seat.team === activeSeat.team) {
      seat.time = activeSeat.time ? { ...activeSeat.time } : undefined;
    }
  }
}

function applyClockElapsed(
  seat: Seat,
  time: TimeConfig | undefined,
  elapsedSeconds: number,
  addIncrement = true,
): void {
  if (!time || time.system === "none" || !seat.time) return;
  let elapsed = Math.max(0, elapsedSeconds);
  const mainUsed = Math.min(seat.time.mainLeft, elapsed);
  seat.time.mainLeft = Math.max(0, seat.time.mainLeft - mainUsed);
  elapsed -= mainUsed;

  if (time.system === "fischer") {
    if (addIncrement) seat.time.mainLeft += time.fischerIncrement ?? 0;
    return;
  }

  if (seat.time.mainLeft > 0) return;
  const periodTime = time.periodTime ?? 0;
  if (elapsed > 0 && periodTime > 0 && seat.time.periodsLeft > 0) {
    const available = seat.time.periodLeft + Math.max(0, seat.time.periodsLeft - 1) * periodTime;
    const remaining = Math.max(0, available - elapsed);
    seat.time.periodsLeft = remaining > 0 ? Math.ceil(remaining / periodTime) : 0;
  }
  seat.time.periodLeft = seat.time.periodsLeft > 0 ? periodTime : 0;
}

export function randomName(playerUuid: string): string {
  const adjectives = [
    "Bouncy",
    "Brave",
    "Bright",
    "Calm",
    "Cheery",
    "Cozy",
    "Dapper",
    "Dreamy",
    "Fluffy",
    "Fuzzy",
    "Gentle",
    "Giddy",
    "Happy",
    "Jolly",
    "Kind",
    "Lucky",
    "Mellow",
    "Merry",
    "Peppy",
    "Plucky",
    "Proud",
    "Snug",
    "Sunny",
    "Sweet",
    "Tiny",
    "Wiggly",
    "Zippy",
  ];
  const animals = [
    "Badger",
    "Bear",
    "Bunny",
    "Cat",
    "Chipmunk",
    "Deer",
    "Duck",
    "Finch",
    "Fox",
    "Frog",
    "Gecko",
    "Hedgehog",
    "Kiwi",
    "Koala",
    "Lamb",
    "Mochi",
    "Mouse",
    "Otter",
    "Panda",
    "Penguin",
    "Pika",
    "Puffin",
    "Quokka",
    "Seal",
    "Shiba",
    "Sparrow",
    "Swan",
    "Turtle",
    "Wombat",
  ];
  const hash = nameHash(playerUuid);
  const adjective = adjectives[hash % adjectives.length];
  const animal = animals[Math.floor(hash / adjectives.length) % animals.length];
  return `${adjective} ${animal}`;
}

function nameHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function removeHiddenClaimAt(state: SharedState, point: { x: number; y: number }): void {
  const setup = state.hiddenSetup;
  if (!setup) return;
  for (const seatSetup of setup.seats) {
    const index = seatSetup.points.findIndex((entry) => entry.x === point.x && entry.y === point.y);
    if (index >= 0) seatSetup.points.splice(index, 1);
  }
}

function inBounds(state: SharedState, point: { x: number; y: number }): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < state.boardWidth && point.y < state.boardHeight;
}

function defaultGameName(id: string): string {
  return `Game #${id}`;
}

function creatorSeatIndex(creatorSeat: string | undefined, seats: Seat[]): number {
  if (creatorSeat === "white" && seats[1]) return 1;
  if (creatorSeat?.startsWith("team-")) {
    const index = seats.findIndex((seat) => seat.id === creatorSeat);
    if (index >= 0) return index;
  }
  if (creatorSeat?.startsWith("player-")) {
    const index = seats.findIndex((seat) => seat.id === creatorSeat);
    if (index >= 0) return index;
  }
  return 0;
}

function teamGoSeats(seatCounts: number[]): Seat[] {
  const counts = seatCounts.map((count) => Math.max(0, Math.trunc(count))).filter((count) =>
    count > 0
  );
  const seats: Seat[] = [];
  const maxSeats = Math.max(...counts);
  for (let seatNumber = 1; seatNumber <= maxSeats; seatNumber++) {
    for (let teamIndex = 0; teamIndex < counts.length; teamIndex++) {
      if (seatNumber > counts[teamIndex]) continue;
      seats.push({
        id: `team-${teamIndex + 1}-${seatNumber}`,
        team: teamIndex + 1,
        resigned: false,
      });
    }
  }
  return seats;
}

export const gameStore = new GameStore();
