import { listShapeCards } from "../api/http.ts";
import { shapeCardGridHtml } from "../game/shape-cards.ts";
import type { ShapeCard } from "../types/domain.ts";

export async function openShapeCardDialog(statusElement: Element | null): Promise<void> {
  const response = await listShapeCards();
  if (!response.ok) {
    if (statusElement) statusElement.textContent = "Could not load Katachi cards.";
    return;
  }
  const { cards: allCards } = await response.json() as { cards: ShapeCard[] };
  // Cards with COUNT=0 are kept only so older games holding them still work.
  const cards = allCards.filter((card) => card.count > 0);
  const total = cards.reduce((sum, card) => sum + card.count, 0);
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog joseki-card-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">×</button>
    <h3>Katachi Cards</h3>
    <p class="ui-muted">Each player shuffles their own ${total}-card copy of this deck.
      You play a card's stones in your own color, rotated or mirrored any way.</p>
    <div class="dialog-scroll ui-scroll">${shapeCardGridHtml(cards)}</div>
  `;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
