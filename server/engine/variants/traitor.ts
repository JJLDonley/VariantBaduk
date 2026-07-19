import type { RuleMods, SharedState } from "../types.ts";
import { zenTeam } from "./zen.ts";

export type PlacementInfo = {
  color: number;
  traitor: boolean;
};

export function placementInfo(state: SharedState, mods: RuleMods): PlacementInfo {
  const activeTeam = state.seats[state.turn].team;
  const baseTeam = mods.zen ? zenTeam(state) : activeTeam;
  if (!mods.traitor) return { color: baseTeam, traitor: false };

  const percentageMode = mods.traitorMode === "percentage";
  const quota = Math.max(1, Math.trunc(mods.traitorStoneCount ?? 1));
  const used = state.play.traitorStonesPlaced[activeTeam - 1] ?? 0;
  const chance = percentageMode
    ? Math.min(1, Math.max(0.01, (mods.traitorChance ?? 10) / 100))
    : traitorChance(state, activeTeam);
  const isTraitor = (percentageMode || used < quota) && randomChance(state, mods) < chance;
  return { color: isTraitor ? nextActiveTeam(state, baseTeam) : baseTeam, traitor: isTraitor };
}

export function updateTraitorState(
  state: SharedState,
  activeTeam: number,
  placement: Pick<PlacementInfo, "traitor">,
  mods: RuleMods,
): void {
  if (!mods.traitor) return;
  const index = activeTeam - 1;
  if (mods.traitorMode === "percentage") {
    if (placement.traitor) {
      state.play.traitorStonesPlaced[index] = (state.play.traitorStonesPlaced[index] ?? 0) + 1;
    }
    return;
  }
  const quota = Math.max(1, Math.trunc(mods.traitorStoneCount ?? 1));
  const used = state.play.traitorStonesPlaced[index] ?? 0;
  if (used >= quota) return;

  if (placement.traitor) {
    state.play.traitorStonesPlaced[index] = Math.min(quota, used + 1);
    state.play.traitorNonTraitorMoves[index] = 0;
  } else {
    state.play.traitorNonTraitorMoves[index] = (state.play.traitorNonTraitorMoves[index] ?? 0) + 1;
  }
}

function traitorChance(state: SharedState, activeTeam: number): number {
  const misses = state.play.traitorNonTraitorMoves[activeTeam - 1] ?? 0;
  return Math.min(1, 0.10 + misses * 0.05);
}

function randomChance(state: SharedState, mods: RuleMods): number {
  if (mods.random) return mods.random();
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  const seed = seededUint32(`${state.play.rngSeed}:${state.play.rngCounter++}`);
  return ((entropy[0] ^ seed) >>> 0) / 0x1_0000_0000;
}

function seededUint32(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let index = 0; index < seed.length; index++) {
    const ch = seed.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

function nextActiveTeam(state: SharedState, currentTeam: number): number {
  for (let offset = 1; offset <= state.seats.length; offset++) {
    const seat = state.seats[(state.turn + offset) % state.seats.length];
    if (!seat.resigned && seat.team !== currentTeam) return seat.team;
  }
  return currentTeam;
}
