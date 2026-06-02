import { listGames, readGameList } from "../api/http.ts";
import type { GameListItem } from "../types/domain.ts";
import { escapeHtml } from "../ui/format.ts";
import { updateGameListHeight } from "../ui/layout.ts";

export async function renderGameList(
  listElement: HTMLElement | null,
  showGame: (gameId: string | undefined) => Promise<void>,
): Promise<void> {
  if (!listElement) return;
  const response = await listGames();
  if (!response.ok) {
    listElement.textContent = "Could not load games.";
    return;
  }
  const { games } = await readGameList(response);
  if (games.length === 0) {
    listElement.innerHTML = `<p class="muted-text">No games yet.</p>`;
    return;
  }
  if (matchMedia("(min-width: 760px)").matches) {
    listElement.closest("details")?.setAttribute("open", "");
  }
  listElement.innerHTML = games.map((game) => gameListItemHtml(game)).join("");

  updateGameListHeight(listElement);

  for (const link of listElement.querySelectorAll<HTMLAnchorElement>(".game-list-item")) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      history.pushState(null, "", link.href);
      await showGame(link.dataset.gameId);
    });
  }
}

export function startGameListRefresh(
  currentEvents: EventSource | undefined,
  setEvents: (events: EventSource | undefined) => void,
  render: () => Promise<void>,
  restart: () => void,
): void {
  if (currentEvents) return;
  const events = new EventSource("/api/games/events");
  setEvents(events);
  events.addEventListener("games_changed", () => render());
  events.addEventListener("error", () => {
    events.close();
    setEvents(undefined);
    setTimeout(restart, 1000);
  });
  addEventListener("focus", () => render());
}

function gameListItemHtml(game: GameListItem): string {
  const label = game.config?.name || `Game #${game.id}`;
  return `<a class="game-list-item" href="/game/${game.id}" data-game-id="${game.id}">${
    escapeHtml(label)
  }</a>`;
}
