import { Board } from "./board.ts";
import type { BoardHistory, PlayState, Seat, SharedState } from "./types.ts";

export function createPlayState(
  seatCount: number,
  teamCount = seatCount,
  rngSeed: string = crypto.randomUUID(),
  phantomPointCount?: number,
): PlayState {
  return {
    playersPassed: Array(seatCount).fill(false),
    captureCount: 0,
    capturedStones: Array(teamCount).fill(0),
    movesPlayed: 0,
    extraTurnsRemaining: 0,
    rngSeed,
    rngCounter: 0,
    traitorStonesPlaced: Array(teamCount).fill(0),
    traitorNonTraitorMoves: Array(teamCount).fill(0),
    ...(phantomPointCount
      ? {
        phantomOwners: Array(phantomPointCount).fill(0),
        phantomRevealed: Array(phantomPointCount).fill(false),
      }
      : {}),
  };
}

export function cloneState(state: SharedState): SharedState {
  return {
    ...state,
    board: [...state.board],
    seats: state.seats.map(cloneSeat),
    points: [...state.points],
    play: clonePlayState(state.play),
    history: state.history.map((history) => ({
      ...history,
      board: [...history.board],
      points: [...history.points],
      play: clonePlayState(history.play),
      hiddenSetup: cloneHiddenSetup(history.hiddenSetup),
    })),
  };
}

export function clonePlayState(play: PlayState): PlayState {
  return {
    playersPassed: [...play.playersPassed],
    lastStone: play.lastStone?.map((point) => ({ ...point })),
    captureCount: play.captureCount,
    capturedStones: [...(play.capturedStones ?? [])],
    movesPlayed: play.movesPlayed ?? 0,
    extraTurnsRemaining: play.extraTurnsRemaining ?? 0,
    extraTurnSeat: play.extraTurnSeat,
    rngSeed: play.rngSeed ?? crypto.randomUUID(),
    rngCounter: play.rngCounter ?? 0,
    traitorStonesPlaced: [...(play.traitorStonesPlaced ?? [])],
    traitorNonTraitorMoves: [...(play.traitorNonTraitorMoves ?? [])],
    phantomOwners: play.phantomOwners ? [...play.phantomOwners] : undefined,
    phantomRevealed: play.phantomRevealed ? [...play.phantomRevealed] : undefined,
    deadStones: play.deadStones ? [...play.deadStones] : undefined,
    noScorePoints: play.noScorePoints ? [...play.noScorePoints] : undefined,
    scoreAccepted: play.scoreAccepted ? [...play.scoreAccepted] : undefined,
    winnerTeams: play.winnerTeams ? [...play.winnerTeams] : undefined,
    endReason: play.endReason,
  };
}

export function pushHistory(
  state: SharedState,
  board: Board,
  action?: "place" | "placeHidden" | "pass" | "resign",
): void {
  state.history.push({
    hash: board.hash(),
    board: [...board.points],
    points: [...state.points],
    turn: state.turn,
    phase: state.phase,
    ...(action ? { action } : {}),
    play: clonePlayState(state.play),
    hiddenSetup: cloneHiddenSetup(state.hiddenSetup),
  });
}

export function stateFromHistory(state: SharedState, history: BoardHistory): SharedState {
  return {
    ...state,
    board: [...history.board],
    points: [...history.points],
    turn: history.turn,
    phase: history.phase,
    play: clonePlayState(history.play),
    hiddenSetup: cloneHiddenSetup(history.hiddenSetup),
    history: [...state.history],
  };
}

function cloneHiddenSetup(setup: SharedState["hiddenSetup"]): SharedState["hiddenSetup"] {
  return setup
    ? {
      ...setup,
      seats: setup.seats.map((seat) => ({
        ...seat,
        points: seat.points.map((point) => ({ ...point })),
        placements: seat.placements?.map((placement) => ({
          origin: { ...placement.origin },
          points: placement.points.map((point) => ({ ...point })),
        })),
      })),
    }
    : undefined;
}

function cloneSeat(seat: Seat): Seat {
  return { ...seat, time: seat.time ? { ...seat.time } : undefined };
}
