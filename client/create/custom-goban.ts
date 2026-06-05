import { copyText } from "../ui/clipboard.ts";
import type { CustomGoban } from "../types/domain.ts";

const CUSTOM_GOBAN_AUTOSAVE_KEY = "baduk:custom-goban-autosave";
const CIRCLOID_POINTS = [
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
];
const CIRCLOID_STAR_POINTS = [
  { x: 10, y: 3 },
  { x: 5, y: 5 },
  { x: 15, y: 5 },
  { x: 3, y: 10 },
  { x: 10, y: 10 },
  { x: 17, y: 10 },
  { x: 5, y: 15 },
  { x: 15, y: 15 },
  { x: 10, y: 17 },
];

export function parseCustomGoban(value: unknown, fallbackSize = 9): CustomGoban {
  if (!value) return emptyGoban(fallbackSize);
  try {
    return normalizeCustomGoban(JSON.parse(String(value)), fallbackSize);
  } catch {
    return emptyGoban(fallbackSize);
  }
}

export function toggleCircloidGoban(root: ParentNode = document): void {
  const form = root.querySelector<HTMLFormElement>("#create-game-form");
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  const customGobanToggle = form?.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const circloidToggle = root.querySelector<HTMLInputElement>("[name='circloidGobanMode']");
  if (!form || !hidden || !customGobanToggle || !circloidToggle) return;

  if (circloidToggle.checked) {
    hidden.value = JSON.stringify(circloidGoban());
    customGobanToggle.checked = true;
  } else {
    const size = Number(form.querySelector<HTMLInputElement>("[name='boardSize']")?.value ?? 9);
    hidden.value = JSON.stringify(emptyGoban(size));
    customGobanToggle.checked = true;
  }
  localStorage.setItem(CUSTOM_GOBAN_AUTOSAVE_KEY, hidden.value);
  refreshCustomGobanPresetButtons(root);
  customGobanToggle.dispatchEvent(new Event("change", { bubbles: true }));
}

export function refreshCustomGobanPresetButtons(root: ParentNode = document): void {
  const form = root.querySelector<HTMLFormElement>("#create-game-form");
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  const customGobanToggle = form?.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const circloidToggle = root.querySelector<HTMLInputElement>("[name='circloidGobanMode']");
  if (!circloidToggle) return;
  circloidToggle.checked = Boolean(
    customGobanToggle?.checked && hidden && isCircloidGoban(parseCustomGoban(hidden.value, 21)),
  );
}

export function restoreCustomGobanAutosave(root: ParentNode = document): void {
  const form = root.querySelector<HTMLFormElement>("#create-game-form");
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  const toggle = form?.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const saved = localStorage.getItem(CUSTOM_GOBAN_AUTOSAVE_KEY);
  if (!hidden || !saved || hidden.value) return;
  const goban = parseCustomGoban(
    saved,
    Number(form?.querySelector<HTMLInputElement>("[name='boardSize']")?.value ?? 9),
  );
  hidden.value = JSON.stringify(goban);
  if (toggle) toggle.checked = true;
}

export function openCustomGobanPreview(
  customGoban: CustomGoban | undefined,
  statusElement: Element | null,
): void {
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
      `<button type="button" class="custom-point ${
        point === -1 ? "is-removed" : ""
      }" disabled></button>`
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
  const autosave = () => {
    hidden.value = JSON.stringify(goban);
    localStorage.setItem(CUSTOM_GOBAN_AUTOSAVE_KEY, hidden.value);
    refreshCustomGobanPresetButtons();
  };
  autosave();
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
      `<button type="button" data-index="${index}" class="custom-point ${
        point === -1 ? "is-removed" : ""
      }"></button>`
    ).join("");
    for (const point of board.querySelectorAll<HTMLElement>(".custom-point")) {
      point.addEventListener("click", () => {
        const index = Number(point.dataset.index);
        goban.points[index] = goban.points[index] === -1 ? 0 : -1;
        autosave();
        render();
      });
    }
  };
  const resize = (width: number, height: number) => {
    const next = Array(width * height).fill(0);
    for (let y = 0; y < Math.min(height, goban.height); y++) {
      for (let x = 0; x < Math.min(width, goban.width); x++) {
        next[y * width + x] = goban.points[y * goban.width + x];
      }
    }
    goban.width = width;
    goban.height = height;
    goban.points = next;
    autosave();
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
      autosave();
      dialog.close();
    }
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement, "Copied");
    if (action === "paste") {
      navigator.clipboard?.readText().then((text) => {
        const pasted = parseCustomGoban(text, size);
        goban.width = pasted.width;
        goban.height = pasted.height;
        goban.points = pasted.points;
        autosave();
        render();
      });
    }
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  render();
  dialog.showModal();
}

function circloidGoban(): CustomGoban {
  const width = 21;
  const height = 21;
  return { width, height, points: [...CIRCLOID_POINTS], starPoints: CIRCLOID_STAR_POINTS };
}

function isCircloidGoban(goban: CustomGoban): boolean {
  const circloid = circloidGoban();
  return goban.width === circloid.width && goban.height === circloid.height &&
    goban.points.length === circloid.points.length &&
    goban.points.every((point, index) => point === circloid.points[index]);
}

function normalizeCustomGoban(value: unknown, fallbackSize: number): CustomGoban {
  if (!value || typeof value !== "object") return emptyGoban(fallbackSize);
  const custom = value as Partial<CustomGoban>;
  const width = boundedInteger(custom.width, 2, 25, fallbackSize);
  const height = boundedInteger(custom.height, 2, 25, fallbackSize);
  const source = Array.isArray(custom.points) ? custom.points : [];
  const points = Array.from(
    { length: width * height },
    (_, index) => source[index] === -1 ? -1 : 0,
  );
  const embeddedStarPoints = source.flatMap((point, index) =>
    point === 1 ? [{ x: index % width, y: Math.floor(index / width) }] : []
  );
  const explicitStarPoints = Array.isArray(custom.starPoints)
    ? custom.starPoints.filter((point) =>
      Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 &&
      point.x < width && point.y < height && points[point.y * width + point.x] !== -1
    ).map((point) => ({ x: point.x, y: point.y }))
    : [];
  const starPoints = uniquePoints([...explicitStarPoints, ...embeddedStarPoints]);
  return { width, height, points, ...(starPoints.length ? { starPoints } : {}) };
}

function uniquePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function emptyGoban(size: number): CustomGoban {
  return { width: size, height: size, points: Array(size * size).fill(0) };
}
