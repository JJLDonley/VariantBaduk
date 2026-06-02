import type { Game, GameId } from "../types/domain.ts";
import { joinSeat } from "../api/http.ts";
import { inviteRulesHtml } from "./variants.ts";

export function openJoinedRulesDialog(game: Game): void {
  const rulesHtml = inviteRulesHtml(game);
  if (rulesHtml === "<ul></ul>") return;
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog invite-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <h3>Variant rules</h3>
    <div class="invite-rules">${rulesHtml}</div>
  `;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

export async function maybeJoinHashSeat(
  game: Game,
  renderGame: (game: Game) => void,
  showGame: (gameId: GameId) => Promise<void>,
): Promise<void> {
  const seatId = decodeURIComponent(location.hash.slice(1));
  if (!seatId) return;
  const seat = game.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.playerUuid) return;
  const response = await joinSeat(game.id, seatId);
  if (!response.ok) return;
  history.replaceState(null, "", `/game/${game.id}`);
  await showGame(game.id);
  renderGame(game);
  openJoinedRulesDialog(game);
}
