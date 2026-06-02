import type { SharedState } from "../types.ts";

export function zenTeam(state: SharedState): number {
  return state.play.movesPlayed % 2 === 0 ? 1 : 2;
}
