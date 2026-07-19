import type { Game } from "../types/domain.ts";

export type CountdownSound = "english" | "chinese" | "beep" | "off";
export type CountdownVoice = Extract<CountdownSound, "english" | "chinese">;

export type CountdownCue = {
  seconds: number;
  key: string;
};

export function countdownAudioPath(
  sound: CountdownVoice,
  seconds: number,
): string | undefined {
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 10
    ? `/countdown/${sound}/${seconds}.aac`
    : undefined;
}

export function countdownCue(game: Game, now = Date.now()): CountdownCue | undefined {
  const time = game.config.time;
  const activeSeat = game.seats[game.turn];
  if (
    game.phase !== "play" || !time || time.system === "none" ||
    game.config.variants?.zen || game.clockUpdatedAt === undefined || !activeSeat
  ) return undefined;

  const seatTime = activeSeat.time ?? activeSeat.clock ?? {};
  const mainLeft = Math.max(0, Number(seatTime.mainLeft ?? seatTime.main ?? time.main ?? 0));
  const elapsed = Math.max(0, (now - game.clockUpdatedAt) / 1000);

  if (time.system === "fischer") {
    const remaining = mainLeft - elapsed;
    return timeoutCue(game, remaining) ?? cueForRemaining(game, remaining, "main");
  }
  if (time.system !== "byoyomi") return undefined;

  if (elapsed < mainLeft) return cueForRemaining(game, mainLeft - elapsed, "main");

  const periodsLeft = Math.max(
    0,
    Math.floor(Number(seatTime.periodsLeft ?? seatTime.periods ?? time.periods ?? 0)),
  );
  const firstPeriod = Math.max(
    0,
    Number(seatTime.periodLeft ?? seatTime.periodTime ?? time.periodTime ?? 0),
  );
  const periodTime = Math.max(0, Number(time.periodTime ?? firstPeriod));
  if (periodsLeft === 0 || firstPeriod === 0) return undefined;

  const overtimeElapsed = elapsed - mainLeft;
  const overtimeRemaining = firstPeriod + Math.max(0, periodsLeft - 1) * periodTime -
    overtimeElapsed;
  const timeout = timeoutCue(game, overtimeRemaining);
  if (timeout) return timeout;
  if (overtimeElapsed < firstPeriod) {
    return cueForRemaining(game, firstPeriod - overtimeElapsed, "period-0");
  }
  if (periodTime === 0) return undefined;

  const laterElapsed = overtimeElapsed - firstPeriod;
  const laterPeriod = Math.floor(laterElapsed / periodTime) + 1;
  if (laterPeriod >= periodsLeft) return undefined;
  const remaining = periodTime - (laterElapsed % periodTime);
  return cueForRemaining(game, remaining, `period-${laterPeriod}`);
}

function cueForRemaining(
  game: Game,
  remaining: number,
  clockSegment: string,
): CountdownCue | undefined {
  if (!(remaining >= 1 && remaining < 11)) return undefined;
  const seconds = Math.floor(remaining);
  return {
    seconds,
    key: `${game.id}:${game.turn}:${game.clockUpdatedAt}:${clockSegment}:${seconds}`,
  };
}

function timeoutCue(game: Game, remaining: number): CountdownCue | undefined {
  if (!(remaining <= 0 && remaining > -1)) return undefined;
  return {
    seconds: 0,
    key: `${game.id}:${game.turn}:${game.clockUpdatedAt}:timeout`,
  };
}
