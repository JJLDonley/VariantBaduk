import { escapeHtml, short } from "../ui/format.ts";
import { activeStoneHtml, seatDisplayTeam, seatMetaHtml, stoneColor } from "./display.ts";
import type { Game, Seat, Session } from "../types/domain.ts";

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
    return `
      <div class="team-seat-box" data-team="${team}">
        <div class="team-seat-list">
          ${seats.map(({ seat, index }) => playerSeatHtml(game, seat, index, session)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function playerSeatHtml(
  game: Game,
  seat: Seat,
  index: number,
  session: Session | undefined,
): string {
  const active = index === game.turn ? "▶" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const action = seat.playerUuid === session?.uuid
    ? `<button class="seat-action" data-action="leave" data-seat-id="${seat.id}" type="button">Leave</button>`
    : !seat.playerUuid
    ? `<span class="seat-actions"><button class="seat-action" data-action="join" data-seat-id="${seat.id}" type="button">Join</button><button class="seat-action" data-action="invite" data-seat-id="${seat.id}" type="button">Invite</button></span>`
    : "";
  const open = !seat.playerUuid;
  return `
    <div class="seat" data-seat-id="${seat.id}" data-open="${open}" ${
    open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'
  }>
      <div class="seat-player"><i class="turn-marker">${active}</i>${
    activeStoneHtml(game, index)
  }<i class="color-dot" data-team="${seatDisplayTeam(game, seat)}" style="--stone-color: ${
    stoneColor(game, seat.team)
  }"></i>${player}</div>
      ${action}
      <div class="seat-time">${seatMetaHtml(game, seat)}</div>
      <div class="seat-points">${game.points[seat.team - 1] ?? 0} pts</div>
    </div>
  `;
}
