import type { ActionKind, SharedState } from "./types.ts";

export function actionSeatIndex(state: SharedState, playerUuid: string, action: ActionKind): number {
  if (action.seatId) {
    return state.seats.findIndex((seat) => seat.id === action.seatId && seat.playerUuid === playerUuid && !seat.resigned);
  }
  return state.seats.findIndex((seat) => seat.playerUuid === playerUuid && !seat.resigned);
}

export function advanceTurn(state: SharedState, keepTurn: boolean): void {
  if (keepTurn) return;
  state.play.extraTurnsRemaining = 0;
  state.play.extraTurnSeat = undefined;
  do {
    state.turn = (state.turn + 1) % state.seats.length;
  } while (state.seats[state.turn].resigned);
}
