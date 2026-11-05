import { escapeHtml, short } from "../ui/format.ts";
import {
  activeStoneHtml,
  colorDotHtml,
  seatDisplayTeam,
  seatMetaHtml,
  stoneColor,
  teamColorName,
} from "./display.ts";
import type { Game, Seat, Session } from "../types/domain.ts";

export function usersColumnHtml(game: Game): string {
  const playerUuids = new Set(
    game.seats.flatMap((seat) => seat.playerUuid ? [seat.playerUuid] : []),
  );
  const unseatedUsers = (game.users ?? []).filter((user) => !playerUuids.has(user.uuid));
  const teamGroups = teamColorPlayerListsHtml(game);
  const viewers = unseatedUsers.map((user) =>
    `<div class="user-row">${escapeHtml(user.name ?? short(user.uuid))}</div>`
  ).join("");
  const viewerList = viewers || (teamGroups ? "" : `<p class="muted-text">None</p>`);
  return `${teamGroups}${viewerList}`;
}

function teamColorPlayerListsHtml(game: Game): string {
  const teams = [...new Set(game.seats.map((seat) => seat.team))];
  return teams.map((team) => {
    const players = game.seats
      .filter((seat) => seat.team === team && seat.playerUuid)
      .map((seat) =>
        `<div class="user-row">${escapeHtml(seat.publicName ?? short(seat.playerUuid!))}</div>`
      )
      .join("") || `<p class="muted-text">None</p>`;
    return `
      <div class="team-users" data-team="${team}">
        <h4>${colorDotHtml(game, team)}${escapeHtml(teamColorName(game, team))}</h4>
        <div class="team-users__players">${players}</div>
      </div>
    `;
  }).join("");
}

export function teamSeatsHtml(game: Game, session: Session | undefined): string {
  if (game.config.variants?.zen) {
    return `
      <div class="team-seat-box" data-team="zen">
        <div class="team-seat-list">
          ${game.seats.map((seat, index) => playerSeatHtml(game, seat, index, session)).join("")}
        </div>
      </div>
    `;
  }
  const teams = [...new Set(game.seats.map((seat) => seat.team))];
  return teams.map((team) => {
    const seats = game.seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => seat.team === team);
    if (game.config.variants?.teamGo) return teamSeatCardHtml(game, team, seats, session);
    return `
      <div class="team-seat-box" data-team="${team}" style="--team-color: ${
      stoneColor(game, team)
    }">
        <div class="team-seat-list">
          ${seats.map(({ seat, index }) => playerSeatHtml(game, seat, index, session)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function teamSeatCardHtml(
  game: Game,
  team: number,
  seats: Array<{ seat: Seat; index: number }>,
  session: Session | undefined,
): string {
  const active = seats.find(({ index }) => index === game.turn);
  const clockSeat = active?.seat ?? seats[0]?.seat;
  return `
    <div class="team-seat-box team-card" data-team="${team}" style="--team-color: ${
    stoneColor(game, team)
  }">
      <div class="team-seat-list">
        ${seats.map(({ seat, index }) => teamSeatRowHtml(game, seat, index, session)).join("")}
      </div>
      <div class="team-card-footer">
        <div class="seat-time">${clockSeat ? seatMetaHtml(game, clockSeat) : "--"}</div>
        <div class="seat-points">${
    clockSeat ? formatSeatPoints(displaySeatPoints(game, clockSeat)) : 0
  } pts</div>
      </div>
    </div>
  `;
}

function teamSeatRowHtml(
  game: Game,
  seat: Seat,
  index: number,
  session: Session | undefined,
): string {
  const active = index === game.turn ? "▶" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const open = !seat.playerUuid;
  return `
    <div class="team-seat-player" data-seat-id="${seat.id}" data-open="${open}" ${
    open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'
  }>
      <i class="turn-marker">${active}</i>
      ${colorDotHtml(game, seat.team)}
      <span class="team-seat-player__name">${player}</span>
      ${seatActionHtml(seat, session)}
    </div>
  `;
}

function playerSeatHtml(
  game: Game,
  seat: Seat,
  index: number,
  session: Session | undefined,
): string {
  const active = index === game.turn ? "▶" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const action = seatActionHtml(seat, session);
  const open = !seat.playerUuid;
  return `
    <div class="seat" data-seat-id="${seat.id}" data-open="${open}" ${
    open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'
  }>
      <div class="seat-player"><i class="turn-marker">${active}</i>${activeStoneHtml(game, index)}${
    colorDotHtml(game, seat.team, seatDisplayTeam(game, seat))
  }${player}</div>
      ${action}
      <div class="seat-time">${seatMetaHtml(game, seat)}</div>
      <div class="seat-points">${formatSeatPoints(displaySeatPoints(game, seat))} pts</div>
    </div>
  `;
}

export function displaySeatPoints(game: Game, seat: Seat): number {
  const score = game.points[seat.team - 1] ?? 0;
  if (game.phase === "scoring" || game.phase === "done") return score;
  if (game.config.variants?.colorGo) {
    return score + (game.config.variants.colorGoKomi?.[seat.team - 1] ?? 0);
  }
  return seat.team === 2 ? score + (game.config.komi ?? 0) : score;
}

function seatActionHtml(seat: Seat, session: Session | undefined): string {
  return seat.playerUuid === session?.uuid
    ? `<button class="seat-action" data-action="leave" data-seat-id="${seat.id}" type="button">Leave</button>`
    : !seat.playerUuid
    ? `<span class="seat-actions"><button class="seat-action" data-action="join" data-seat-id="${seat.id}" type="button">Join</button><button class="seat-action" data-action="invite" data-seat-id="${seat.id}" type="button">Invite</button></span>`
    : "";
}

function formatSeatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : String(Number(points.toFixed(2)));
}
