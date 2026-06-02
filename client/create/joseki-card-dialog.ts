import { listJosekiCards, readJosekiCards } from "../api/http.ts";
import { josekiCardGridHtml } from "../game/joseki-card.ts";
import type { JosekiCard } from "../types/domain.ts";

export async function openJosekiCardDialog(statusElement: Element | null): Promise<void> {
  const response = await listJosekiCards();
  if (!response.ok) {
    if (statusElement) statusElement.textContent = "Could not load joseki cards.";
    return;
  }
  const { cards } = await readJosekiCards(response);
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog joseki-card-dialog";
  dialog.innerHTML = josekiCardDialogHtml(cards);
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

function josekiCardDialogHtml(cards: JosekiCard[]): string {
  return `
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <h3>Joseki Cards</h3>
    <p class="ui-muted">Preview available cards. Selection and pre-game placement are next.</p>
    ${josekiCardGridHtml(cards)}
  `;
}
