import type { ActionKind, RuleMods, SharedState } from "./types.ts";

export function actionSeatIndex(
  state: SharedState,
  playerUuid: string,
  action: ActionKind,
): number {
  if (action.seatId) {
    return state.seats.findIndex((seat) =>
      seat.id === action.seatId && seat.playerUuid === playerUuid && !seat.resigned
    );
  }
  return state.seats.findIndex((seat) => seat.playerUuid === playerUuid && !seat.resigned);
}

export function advanceTurn(state: SharedState, keepTurn: boolean, mods: RuleMods = {}): void {
  if (keepTurn) return;
  state.play.extraTurnsRemaining = 0;
  state.play.extraTurnSeat = undefined;
  if (mods.randomTurn) {
    const activeTeams = activeSeatIndexesByTeam(state);
    const teamIndexes = activeTeams[Math.floor(randomChance(state, mods) * activeTeams.length)] ??
      [];
    state.turn = nextSeatIndexInTeam(teamIndexes, state.turn) ?? state.turn;
    return;
  }
  if (mods.teamGo) {
    const activeTeams = activeSeatIndexesByTeam(state);
    const currentTeamIndex = activeTeams.findIndex((indexes) => indexes.includes(state.turn));
    const nextTeamIndexes = activeTeams[(currentTeamIndex + 1) % activeTeams.length] ?? [];
    state.turn = nextSeatIndexInTeam(nextTeamIndexes, state.turn) ?? state.turn;
    return;
  }
  do {
    state.turn = (state.turn + 1) % state.seats.length;
  } while (state.seats[state.turn].resigned);
}

function nextSeatIndexInTeam(teamIndexes: number[], currentTurn: number): number | undefined {
  return teamIndexes.find((index) => index > currentTurn) ?? teamIndexes[0];
}

function activeSeatIndexesByTeam(state: SharedState): number[][] {
  const teams = new Map<number, number[]>();
  for (const [index, seat] of state.seats.entries()) {
    if (seat.resigned) continue;
    const indexes = teams.get(seat.team) ?? [];
    indexes.push(index);
    teams.set(seat.team, indexes);
  }
  return [...teams.values()];
}

function randomChance(state: SharedState, mods: RuleMods): number {
  if (mods.random) return mods.random();
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  const seed = seededUint32(`${state.play.rngSeed}:turn:${state.play.rngCounter++}`);
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
