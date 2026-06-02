import type { Game } from "../types/domain.ts";

export type HistoryNavigationAction = "first" | "prev" | "next" | "latest";

export function bindHistoryKeyboardControls(
  game: Game,
  historyIndex: number,
  latestHistoryIndex: number,
  controller: AbortController | undefined,
  canNavigate: (game: Game) => boolean,
  navigate: (game: Game, historyIndex: number, latestHistoryIndex: number, action: HistoryNavigationAction) => void,
): AbortController | undefined {
  controller?.abort();
  if (!canNavigate(game)) return undefined;
  const nextController = new AbortController();
  document.addEventListener("keydown", (event) => {
    if (!matchMedia("(min-width: 760px)").matches) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableKeyTarget(event.target)) return;
    const action = historyActionFromKey(event.key);
    if (!action) return;
    event.preventDefault();
    navigate(game, historyIndex, latestHistoryIndex, action);
  }, { signal: nextController.signal });
  return nextController;
}

function historyActionFromKey(key: string): HistoryNavigationAction | undefined {
  if (key === "ArrowLeft") return "prev";
  if (key === "ArrowRight") return "next";
  if (key === "ArrowUp") return "first";
  if (key === "ArrowDown") return "latest";
  return undefined;
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}
