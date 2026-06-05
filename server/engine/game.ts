import { Board, findGroups } from "./board.ts";
import { captureDeadOpponents, violatesSuperko } from "./capture.ts";
import { applyHandicap } from "./handicap.ts";
import { scoreBoard, scoringAreaPoints, winnerTeams } from "./scoring.ts";
import { cloneState, createPlayState, pushHistory, stateFromHistory } from "./state.ts";
import { shouldKeepTurn } from "./variants/nPlusOne.ts";
import {
  markPhantomPlaced,
  phantomOpponentCollisionIndexes,
  revealAllPhantomStones,
  revealAroundPhantomCaptures,
  revealPhantomAtariGroups,
  revealPhantomPoints,
} from "./variants/phantom.ts";
import { placementPoints } from "./variants/pixel.ts";
import { createsTetrisFourGroup } from "./variants/tetris.ts";
import { actionSeatIndex, advanceTurn } from "./turn.ts";
import { placementInfo, updateTraitorState } from "./variants/traitor.ts";
import type { ActionKind, MakeActionResult, RuleMods, Seat, SharedState } from "./types.ts";

export type CreateGameOptions = {
  id?: string;
  width: number;
  height?: number;
  seats?: Seat[];
  handicap?: number;
  rngSeed?: string;
  points?: number[];
  phantomMove?: boolean;
};

export function createGame(options: CreateGameOptions): SharedState {
  const width = options.width;
  const height = options.height ?? width;
  const seats = options.seats ?? [
    { id: "black", team: 1, resigned: false },
    { id: "white", team: 2, resigned: false },
  ];
  const teamCount = Math.max(...seats.map((seat) => seat.team));
  const pointCount = width * height;
  const play = createPlayState(
    seats.length,
    teamCount,
    options.rngSeed,
    options.phantomMove ? pointCount : undefined,
  );
  const board = new Board(width, height, options.points);
  const state: SharedState = {
    id: options.id ?? crypto.randomUUID(),
    boardWidth: width,
    boardHeight: height,
    board: board.points,
    seats,
    points: Array(teamCount).fill(0),
    turn: 0,
    phase: "play",
    play,
    history: [],
  };
  applyHandicap(state, board, options.handicap ?? 0);
  pushHistory(state, board);
  return state;
}

export function makeAction(
  state: SharedState,
  playerUuid: string,
  action: ActionKind,
  mods: RuleMods = {},
): MakeActionResult {
  const activeSeat = state.seats[state.turn];
  const playerSeatIndex = actionSeatIndex(state, playerUuid, action);
  if (!allSeatsFilled(state)) return { ok: false, error: "waiting_for_players" };
  if (state.phase === "scoring") {
    if (playerSeatIndex < 0) return { ok: false, error: "not_turn" };
    const next = cloneState(state);
    const board = Board.from(next.boardWidth, next.boardHeight, next.board);
    if (action.type === "toggleDead") return toggleDead(next, board, action.point, mods);
    if (action.type === "toggleNoScore") return toggleNoScore(next, board, action.point, mods);
    if (action.type === "acceptScore") return acceptScore(next, board, playerSeatIndex, mods);
    return { ok: false, error: "illegal" };
  }
  if (state.phase !== "play") return { ok: false, error: "illegal" };

  if (activeSeat.playerUuid !== playerUuid || (action.seatId && activeSeat.id !== action.seatId)) {
    return { ok: false, error: "not_turn" };
  }

  const next = cloneState(state);
  const board = Board.from(next.boardWidth, next.boardHeight, next.board);

  switch (action.type) {
    case "place":
      return place(next, board, action.point, mods);
    case "pass":
      return pass(next, board, mods);
    case "resign":
      return resign(next, board, mods);
    case "cancel":
      return rollback(next);
    default:
      return { ok: false, error: "illegal" };
  }
}

function place(
  state: SharedState,
  board: Board,
  point: { x: number; y: number },
  mods: RuleMods,
): MakeActionResult {
  const activeSeat = state.seats[state.turn];
  const placement = placementInfo(state, mods);
  const color = placement.color;

  const pointsPlayed = placementPoints(board, point, mods);
  if (pointsPlayed.length === 0) return { ok: false, error: "out_of_bounds" };
  const occupiedPoints = pointsPlayed.filter((point) => board.get(point) > 0);
  const emptyPoints = pointsPlayed.filter((point) => board.get(point) === 0);
  if ((mods.phantomMove || mods.hiddenMove) && occupiedPoints.length > 0) {
    const opponentIndexes = phantomOpponentCollisionIndexes(
      state,
      board,
      occupiedPoints,
      activeSeat.team,
      mods,
    );
    if (opponentIndexes.length > 0) {
      revealPhantomPoints(state, opponentIndexes);
      if (emptyPoints.length === 0) return { ok: false, error: "point_occupied", state };
    }
  }
  if (emptyPoints.length === 0) return { ok: false, error: "point_occupied" };

  for (const point of emptyPoints) board.set(point, color);
  markPhantomPlaced(state, emptyPoints, activeSeat.team, mods);
  const capturedGroups = captureDeadOpponents(board, color);
  const captured = capturedGroups.reduce((total, group) => total + group.points.length, 0);
  const ownDead = findGroups(board).filter((group) =>
    group.color === color && group.liberties === 0
  );
  if (ownDead.length > 0) return { ok: false, error: "suicide" };
  if (mods.tetris && createsTetrisFourGroup(board, emptyPoints, color)) {
    return { ok: false, error: "illegal" };
  }

  const nextHash = board.hash();
  if (violatesSuperko(state, board, nextHash, captured)) return { ok: false, error: "ko" };

  state.board = board.points;
  if (captured > 0) {
    state.play.capturedStones[activeSeat.team - 1] =
      (state.play.capturedStones[activeSeat.team - 1] ?? 0) + captured;
    if (mods.capturesGivePoints) state.points[activeSeat.team - 1] += captured * 2;
    if (mods.ponnukiPointValue) {
      state.points[activeSeat.team - 1] += capturedGroups.filter((group) =>
        group.points.length === 1
      ).length * mods.ponnukiPointValue;
    }
  }
  if ((mods.phantomMove || mods.hiddenMove) && captured > 0) {
    revealAroundPhantomCaptures(
      state,
      board,
      capturedGroups.flatMap((group) => group.points),
    );
  }
  revealPhantomAtariGroups(state, board, mods);
  updateTraitorState(state, activeSeat.team, placement, mods);
  state.play.movesPlayed += 1;
  state.play.lastStone = emptyPoints;
  state.play.captureCount += captured;
  state.play.playersPassed = state.play.playersPassed.map(() => false);
  advanceTurn(
    state,
    shouldKeepTurnForFreeHandicap(state, mods) ||
      shouldKeepTurn(state, board, emptyPoints, color, mods),
    mods,
  );
  pushHistory(state, board, "place");
  return { ok: true, state };
}

function pass(state: SharedState, board: Board, mods: RuleMods): MakeActionResult {
  const activeSeat = state.seats[state.turn];
  state.seats.forEach((seat, index) => {
    if (mods.zen ? index === state.turn : seat.team === activeSeat.team) {
      state.play.playersPassed[index] = true;
    }
  });
  state.play.extraTurnsRemaining = 0;
  advanceTurn(state, false, mods);

  const allDone = state.seats.every((seat, index) =>
    seat.resigned || state.play.playersPassed[index]
  );
  if (allDone) {
    if (mods.phantomMove || mods.hiddenMove) revealAllPhantomStones(state);
    state.phase = "scoring";
    state.play.deadStones = Array(state.boardWidth * state.boardHeight).fill(false);
    state.play.noScorePoints = Array(state.boardWidth * state.boardHeight).fill(false);
    state.play.scoreAccepted = state.play.playersPassed.map(() => false);
    state.points = scoreBoard(state, board, mods);
    state.play.playersPassed = state.play.playersPassed.map(() => false);
  }

  pushHistory(state, board, "pass");
  return { ok: true, state };
}

function resign(state: SharedState, board: Board, mods: RuleMods): MakeActionResult {
  state.seats[state.turn].resigned = true;
  const activeSeats = state.seats.filter((seat) => !seat.resigned);
  if (activeSeats.length === 0 || (!mods.colorGo && activeSeats.length <= 1)) {
    state.phase = "done";
    state.play.winnerTeams = [...new Set(activeSeats.map((seat) => seat.team))];
  } else {
    state.play.extraTurnsRemaining = 0;
    advanceTurn(state, false, mods);
  }
  pushHistory(state, board, "resign");
  return { ok: true, state };
}

function rollback(state: SharedState): MakeActionResult {
  if (state.history.length < 2) return { ok: false, error: "illegal" };
  const previous = state.history.at(-2)!;
  if (state.phase === "play" && previous.phase !== "play") return { ok: false, error: "illegal" };
  state.history.pop();
  return { ok: true, state: stateFromHistory(state, previous) };
}

function toggleDead(
  state: SharedState,
  board: Board,
  point: { x: number; y: number },
  mods: RuleMods,
): MakeActionResult {
  if (!board.playable(point) || board.get(point) <= 0) return { ok: false, error: "illegal" };
  const group = findGroups(board).find((group) =>
    group.points.some((groupPoint) => groupPoint.x === point.x && groupPoint.y === point.y)
  );
  if (!group) return { ok: false, error: "illegal" };
  state.play.deadStones ??= Array(state.boardWidth * state.boardHeight).fill(false);
  const dead = !state.play.deadStones[pointIndex(state, point)];
  for (const groupPoint of group.points) {
    state.play.deadStones[pointIndex(state, groupPoint)] = dead;
  }
  state.play.scoreAccepted = state.play.scoreAccepted?.map(() => false) ??
    state.seats.map(() => false);
  state.points = scoreBoard(state, board, mods);
  pushHistory(state, board);
  return { ok: true, state };
}

function toggleNoScore(
  state: SharedState,
  board: Board,
  point: { x: number; y: number },
  mods: RuleMods,
): MakeActionResult {
  if (!board.playable(point)) return { ok: false, error: "illegal" };
  const area = scoringAreaPoints(state, board, point);
  if (area.length === 0) return { ok: false, error: "illegal" };
  state.play.noScorePoints ??= Array(state.boardWidth * state.boardHeight).fill(false);
  const noScore = !state.play.noScorePoints[pointIndex(state, point)];
  for (const areaPoint of area) state.play.noScorePoints[pointIndex(state, areaPoint)] = noScore;
  state.play.scoreAccepted = state.play.scoreAccepted?.map(() => false) ??
    state.seats.map(() => false);
  state.points = scoreBoard(state, board, mods);
  pushHistory(state, board);
  return { ok: true, state };
}
function acceptScore(
  state: SharedState,
  board: Board,
  seatIndex: number,
  mods: RuleMods,
): MakeActionResult {
  state.play.scoreAccepted ??= state.seats.map(() => false);
  if (state.play.scoreAccepted[seatIndex]) return { ok: false, error: "illegal" };
  state.play.scoreAccepted[seatIndex] = true;
  state.points = scoreBoard(state, board, mods);
  const activeSeats = state.seats.every((seat, index) =>
    seat.resigned || !seat.playerUuid || state.play.scoreAccepted?.[index]
  );
  if (activeSeats) {
    state.phase = "done";
    state.play.winnerTeams = winnerTeams(state.points);
  }
  pushHistory(state, board);
  return { ok: true, state };
}
function allSeatsFilled(state: SharedState): boolean {
  return state.seats.every((seat) => Boolean(seat.playerUuid));
}

function shouldKeepTurnForFreeHandicap(state: SharedState, mods: RuleMods): boolean {
  const count = Math.trunc(mods.freeHandicapCount ?? 0);
  if (count <= 1 || state.play.movesPlayed >= count) return false;
  return state.seats[state.turn]?.team === 1;
}

function pointIndex(state: SharedState, point: { x: number; y: number }): number {
  return point.y * state.boardWidth + point.x;
}
