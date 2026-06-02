import { copyText } from "../ui/clipboard.ts";
import type { CustomGoban } from "../types/domain.ts";

export function parseCustomGoban(value: unknown, fallbackSize = 9): CustomGoban {
  if (!value) return emptyGoban(fallbackSize);
  try {
    return JSON.parse(String(value));
  } catch {
    return emptyGoban(fallbackSize);
  }
}

export function openCustomGobanPreview(customGoban: CustomGoban | undefined, statusElement: Element | null): void {
  if (!customGoban) return;
  const goban = {
    width: customGoban.width,
    height: customGoban.height,
    points: [...customGoban.points],
  };
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">×</button>
    <div class="custom-goban-controls">
      <button data-goban="copy" type="button">Copy</button>
    </div>
    <div class="custom-goban-board-wrap"><div class="custom-goban-board"></div></div>
  `;
  document.body.append(dialog);
  const board = dialog.querySelector<HTMLElement>(".custom-goban-board");
  if (board) {
    board.style.gridTemplateColumns = `repeat(${goban.width}, 1fr)`;
    board.innerHTML = goban.points.map((point) =>
      `<button type="button" class="custom-point ${point === -1 ? "is-removed" : ""}" disabled></button>`
    ).join("");
  }
  dialog.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const action = target?.closest<HTMLElement>("[data-goban]")?.dataset.goban;
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement, "Copied");
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

export function openCustomGobanEditor(statusElement: Element | null): void {
  const form = document.querySelector<HTMLFormElement>("#create-game-form");
  const size = Number(form?.querySelector<HTMLInputElement>("[name='boardSize']")?.value ?? 9);
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  if (!hidden) return;
  const goban = parseCustomGoban(hidden.value, size);
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  let resizeMode = "both";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">×</button>
    <div class="custom-goban-controls">
      <button data-goban="reset" type="button">Reset</button>
      <button data-goban="save" type="button">Save</button>
      <button data-goban="copy" type="button">Copy</button>
      <button data-goban="paste" type="button">Paste</button>
      <button data-goban="mode" type="button">Both</button>
      <button data-goban="add" type="button">+</button>
      <button data-goban="remove" type="button">−</button>
    </div>
    <div class="custom-goban-board-wrap"><div class="custom-goban-board"></div></div>
  `;
  document.body.append(dialog);

  const render = () => {
    const board = dialog.querySelector<HTMLElement>(".custom-goban-board");
    if (!board) return;
    board.style.gridTemplateColumns = `repeat(${goban.width}, 1fr)`;
    board.innerHTML = goban.points.map((point, index) =>
      `<button type="button" data-index="${index}" class="custom-point ${point === -1 ? "is-removed" : ""}"></button>`
    ).join("");
    for (const point of board.querySelectorAll<HTMLElement>(".custom-point")) {
      point.addEventListener("click", () => {
        const index = Number(point.dataset.index);
        goban.points[index] = goban.points[index] === -1 ? 0 : -1;
        render();
      });
    }
  };
  const resize = (width: number, height: number) => {
    const next = Array(width * height).fill(0);
    for (let y = 0; y < Math.min(height, goban.height); y++) {
      for (let x = 0; x < Math.min(width, goban.width); x++) next[y * width + x] = goban.points[y * goban.width + x];
    }
    goban.width = width;
    goban.height = height;
    goban.points = next;
    render();
  };

  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>("[data-goban]")?.dataset.goban;
    if (!action) return;
    if (action === "mode") {
      resizeMode = resizeMode === "row" ? "col" : resizeMode === "col" ? "both" : "row";
      target.textContent = resizeMode === "row" ? "Row" : resizeMode === "col" ? "Col" : "Both";
    }
    if (action === "add") {
      resize(
        resizeMode === "row" ? goban.width : Math.min(25, goban.width + 1),
        resizeMode === "col" ? goban.height : Math.min(25, goban.height + 1),
      );
    }
    if (action === "remove") {
      resize(
        resizeMode === "row" ? goban.width : Math.max(2, goban.width - 1),
        resizeMode === "col" ? goban.height : Math.max(2, goban.height - 1),
      );
    }
    if (action === "reset") resize(size, size);
    if (action === "save") {
      hidden.value = JSON.stringify(goban);
      dialog.close();
    }
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement, "Copied");
    if (action === "paste") navigator.clipboard?.readText().then((text) => {
      const pasted = parseCustomGoban(text, size);
      goban.width = pasted.width;
      goban.height = pasted.height;
      goban.points = pasted.points;
      render();
    });
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  render();
  dialog.showModal();
}

function emptyGoban(size: number): CustomGoban {
  return { width: size, height: size, points: Array(size * size).fill(0) };
}
