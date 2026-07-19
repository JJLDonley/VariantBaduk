import {
  escapeHtml,
  formatByoyomiTime,
  formatHms,
  rulesText,
  short,
  timeSettingsText,
} from "../ui/format.ts";
import type { Game, Seat } from "../types/domain.ts";
import { variantsHtml } from "./variants.ts";

export function winnerText(game: Game): string {
  const names = (game.winnerTeams ?? []).map((team: number) => {
    const seat = game.seats.find((seat) => seat.team === team);
    return escapeHtml(seat?.publicName ?? seat?.id ?? `Team ${team}`);
  });
  return names.length > 1 ? `Tie: ${names.join(", ")}` : names[0];
}

export function resultText(game: Game): string {
  const winners = winningTeams(game);
  if (game.phase !== "done" || winners.length === 0) return "";
  if (winners.length > 1) return winnerText({ ...game, winnerTeams: winners });

  const winnerTeam = winners[0];
  const prefix = teamResultPrefix(winnerTeam);
  const lastAction = game.history?.at(-1)?.action;
  const wonByResignation = lastAction === "resign" ||
    game.seats.some((seat) => seat.resigned && seat.team !== winnerTeam);
  if (wonByResignation) return `${prefix}+R`;

  const winnerScore = game.points?.[winnerTeam - 1];
  const nextBestScore = Math.max(
    ...game.points.map((score, index) => index + 1 === winnerTeam ? -Infinity : score),
  );
  const margin = winnerScore - nextBestScore;
  return Number.isFinite(margin) ? `${prefix}+${formatPoints(margin)}` : prefix;
}

function teamResultPrefix(team: number): string {
  if (team === 1) return "B";
  if (team === 2) return "W";
  return `T${team}`;
}

function winningTeams(game: Game): number[] {
  if (game.winnerTeams?.length) return game.winnerTeams;
  if (game.phase !== "done") return [];
  const activeTeams = [
    ...new Set(game.seats.filter((seat) => !seat.resigned).map((seat) => seat.team)),
  ];
  return activeTeams.length === 1 ? activeTeams : [];
}

function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

export function scoringHelpHtml(): string {
  return `
    <div class="scoring-help">
      <h4>Scoring</h4>
      <p>After all players pass, mark dead stones, optionally mark no-score areas, then Done.</p>
      <p>Click stones to mark dead groups. Shift-click or right-click empty areas to mark no-score/seki.</p>
    </div>
  `;
}

export function gameInfoHtml(game: Game): string {
  return `
    <div class="game-meta">
      <span><strong>Time Settings</strong>${timeSettingsText(game.config.time)}</span>
      <span><strong>Scoring</strong>${rulesText(game.config.ruleset)} · Komi ${
    game.config.komi ?? 7.5
  } · Handicap ${game.config.handicap ?? 0}</span>
      <span><strong>Board size</strong>${game.boardWidth} × ${game.boardHeight}</span>
      <span><strong>Variants</strong><span class="variant-meta-list">${
    variantsHtml(game)
  }</span></span>
    </div>
  `;
}

export function activeStoneHtml(game: Game, index: number): string {
  if (!game.config.variants?.zen || index !== game.turn) return "";
  return `<i class="color-dot active-stone" data-team="${
    placementPreviewTeam(game)
  }" style="--stone-color: ${stoneColor(game, placementPreviewTeam(game))}"></i>`;
}

export function seatDisplayTeam(game: Game, seat: Seat): number {
  return game.config.variants?.zen ? 0 : seat.team;
}

export function stoneColor(game: Game, team: number): string {
  const color = game.config.variants?.colorGoColors?.[team - 1];
  if (color) return color;
  const defaults = ["#080808", "#eeeeee", "#4f9d69", "#e07a5f", "#6c8cff"];
  return defaults[team - 1] ?? "#777777";
}

export function placementPreviewTeam(game: Game): number {
  const activeTeam = game.seats[game.turn]?.team ?? 1;
  return game.config.variants?.zen ? ((game.playMoves ?? 0) % 2) + 1 : activeTeam;
}

export function seatMetaHtml(game: Game, seat: Seat): string {
  if (game.phase === "done" && winningTeams(game).includes(seat.team)) return "Winner!";
  const clockText = seatClockText(game, seat);
  if (game.phase === "done" && winningTeams(game).includes(seat.team)) return "Winner!";
  const lines = [clockText];
  if (game.config.variants?.traitor) {
    if (game.config.variants.traitorMode === "percentage") {
      lines.push(`TG: ${game.config.variants.traitorChance ?? 10}%`);
    } else {
      const used = game.traitorStonesPlaced?.[seat.team - 1] ?? 0;
      const total = game.config.variants.traitorStoneCount ?? 6;
      lines.push(`TG: ${Math.max(0, total - used)}`);
    }
  }
  return lines.join("<br />");
}

export function userHtml(game: Game, seat: Seat): string {
  return `<div class="user-row"><i class="color-dot" data-team="${seat.team}" style="--stone-color: ${
    stoneColor(game, seat.team)
  }"></i>${escapeHtml(seat.publicName ?? short(seat.playerUuid))}</div>`;
}

export function viewersHtml(game: Game): string {
  return (game.users ?? []).map((user) =>
    `<div class="user-row">${escapeHtml(user.name ?? short(user.uuid))}</div>`
  ).join("") ||
    `<p class="muted-text">None</p>`;
}

function seatClockText(game: Game, seat: Seat): string {
  const time = game.config.time;
  if (!time || time.system === "none" || game.config.variants?.zen) return "--:--";

  const seatTime = currentSeatTime(game, seat);
  const mainLeft = Number(seatTime.mainLeft ?? seatTime.main ?? time.main ?? 0);
  if (mainLeft > 0 || time.system === "fischer") return formatHms(mainLeft);

  if (time.system === "byoyomi") {
    const periodLeft = Number(seatTime.periodLeft ?? seatTime.periodTime ?? time.periodTime ?? 0);
    const periodsLeft = Number(seatTime.periodsLeft ?? seatTime.periods ?? time.periods ?? 0);
    return `${formatByoyomiTime(periodLeft)} x ${periodsLeft}`;
  }

  return "No time";
}

function currentSeatTime(game: Game, seat: Seat): Record<string, number> {
  const base = seat.time ?? seat.clock ?? {};
  const time = game.config.time ?? {};
  const display = {
    mainLeft: Number(base.mainLeft ?? base.main ?? time.main ?? 0),
    periodLeft: Number(base.periodLeft ?? base.periodTime ?? time.periodTime ?? 0),
    periodsLeft: Number(base.periodsLeft ?? base.periods ?? time.periods ?? 0),
  };
  if (
    game.phase !== "play" || game.seats[game.turn]?.team !== seat.team ||
    game.clockUpdatedAt === undefined
  ) return display;

  const secondsUntilLoss = time.system === "fischer"
    ? display.mainLeft
    : display.mainLeft + display.periodLeft +
      Math.max(0, display.periodsLeft - 1) * (time.periodTime ?? 0);
  if ((Date.now() - game.clockUpdatedAt) / 1000 >= secondsUntilLoss + 1) {
    game.phase = "done";
    game.clockUpdatedAt = undefined;
    seat.resigned = true;
    game.winnerTeams = winningTeams(game);
    return display;
  }

  let elapsed = Math.max(0, (Date.now() - game.clockUpdatedAt) / 1000);
  const mainUsed = Math.min(display.mainLeft, elapsed);
  display.mainLeft = Math.max(0, display.mainLeft - mainUsed);
  elapsed -= mainUsed;
  if (time.system === "byoyomi" && display.mainLeft <= 0 && elapsed > 0) {
    const periodTime = time.periodTime || display.periodLeft || 1;
    const periodUsed = Math.min(display.periodLeft, elapsed);
    display.periodLeft = Math.max(0, display.periodLeft - periodUsed);
    elapsed -= periodUsed;
    if (elapsed > 0 && display.periodsLeft > 0) {
      const available = display.periodLeft + Math.max(0, display.periodsLeft - 1) * periodTime;
      const remaining = Math.max(0, available - elapsed);
      display.periodsLeft = remaining > 0 ? Math.ceil(remaining / periodTime) : 0;
      display.periodLeft = display.periodsLeft > 0
        ? Math.max(0, remaining - (display.periodsLeft - 1) * periodTime)
        : 0;
    }
  }
  return display;
}
