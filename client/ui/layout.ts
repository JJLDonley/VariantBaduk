export function updateGameListHeight(listElement: HTMLElement | null): void {
  if (!listElement) return;
  if (!matchMedia("(min-width: 760px)").matches) {
    listElement.style.removeProperty("height");
    return;
  }
  const bottomPadding = 16;
  const top = listElement.getBoundingClientRect().top;
  const height = Math.max(0, window.innerHeight - top - bottomPadding);
  listElement.style.height = `${height}px`;
}

export function updateGameLayoutMode(shell: Element | null): void {
  if (!shell) return;
  if (!shell.classList.contains("game-layout")) {
    shell.classList.remove("desktop-fit");
    return;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const boardSize = Math.max(240, Math.min(width - 8, height - 224));
  const rightPanels = 16 * 16 + 1 + 14 * 16 + 48;
  shell.classList.toggle("desktop-fit", width >= 760 && width >= boardSize + rightPanels + 24);
}
