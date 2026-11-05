import { copyText } from "../ui/clipboard.ts";
import { GOBAN_PRESETS, matchingPresetId, presetGoban } from "./goban-presets.ts";
import type { CustomGoban } from "../types/domain.ts";
import { boardGridHtml, boardLandHtml, starPointsHtml } from "../game/board-render.ts";
import {
  type BoardFrame,
  boardFrame,
  type BoardLike,
  frameGridCoords,
  pointPosition,
  starPointCoords,
} from "../game/board-utils.ts";
import {
  CUSTOM_BOARD_MAX_SIZE,
  CUSTOM_BOARD_MIN_SIZE,
  exceedsPhoneFriendlySize,
  islandCount,
  playablePointCount,
} from "../shared/custom-board.ts";

const CUSTOM_GOBAN_AUTOSAVE_KEY = "baduk:custom-goban-autosave";
export function parseCustomGoban(value: unknown, fallbackSize = 9): CustomGoban {
  if (!value) return emptyGoban(fallbackSize);
  try {
    return normalizeCustomGoban(JSON.parse(String(value)), fallbackSize);
  } catch {
    return emptyGoban(fallbackSize);
  }
}

/**
 * Applies the create form's Preset choice: a preset's board, or ("Custom") a fresh board at the
 * selected size to draw on.
 */
export function applyGobanPreset(root: ParentNode = document): void {
  const form = root.querySelector<HTMLFormElement>("#create-game-form");
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  const customGobanToggle = form?.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const select = root.querySelector<HTMLSelectElement>("[name='gobanPreset']");
  if (!form || !hidden || !customGobanToggle || !select) return;
  const size = Number(form.querySelector<HTMLInputElement>("[name='boardSize']")?.value ?? 9);
  hidden.value = JSON.stringify(presetGoban(select.value) ?? emptyGoban(size));
  customGobanToggle.checked = true;
  localStorage.setItem(CUSTOM_GOBAN_AUTOSAVE_KEY, hidden.value);
  customGobanToggle.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fills the Preset dropdown (once) and shows which preset the current board matches. */
export function refreshCustomGobanPreset(root: ParentNode = document): void {
  const form = root.querySelector<HTMLFormElement>("#create-game-form");
  const hidden = form?.querySelector<HTMLInputElement>("[name='customGoban']");
  const select = root.querySelector<HTMLSelectElement>("[name='gobanPreset']");
  if (!select) return;
  if (select.options.length <= 1) select.insertAdjacentHTML("beforeend", presetOptionsHtml());
  const goban = hidden?.value ? parseCustomGoban(hidden.value) : undefined;
  select.value = goban ? matchingPresetId(goban) ?? "" : "";
}

function presetOptionsHtml(): string {
  return GOBAN_PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`)
    .join("");
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
  const goban: CustomGoban = {
    width: customGoban.width,
    height: customGoban.height,
    points: [...customGoban.points],
    ...(customGoban.starPoints ? { starPoints: [...customGoban.starPoints] } : {}),
  };
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">×</button>
    <div class="custom-goban-controls">
      <button data-goban="copy" type="button">Copy</button>
    </div>
    <p class="custom-goban-summary" aria-live="polite">${gobanSummary(goban)}</p>
    <div class="custom-goban-board-wrap">${customBoardHtml(goban, false)}</div>
  `;
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const action = target?.closest<HTMLElement>("[data-goban]")?.dataset.goban;
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement, "Copied");
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

/** Editor tools: add playable points, remove them (water), or toggle star points. */
export type GobanTool = "land" | "water" | "star";

/** Applies a tool to one point; returns whether the board changed. */
export function paintGobanPoint(goban: CustomGoban, index: number, tool: GobanTool): boolean {
  if (index < 0 || index >= goban.points.length) return false;
  const x = index % goban.width;
  const y = Math.floor(index / goban.width);
  if (tool === "star") {
    if (goban.points[index] === -1) return false;
    const stars = gobanStarPoints(goban);
    const has = stars.some((star) => star.x === x && star.y === y);
    setStarPoints(
      goban,
      has ? stars.filter((star) => star.x !== x || star.y !== y) : [
        ...stars,
        { x, y },
      ],
    );
    return true;
  }
  const value = tool === "land" ? 0 : -1;
  if (goban.points[index] === value) return false;
  goban.points[index] = value;
  // A removed point can't hold a star point.
  if (value === -1 && goban.starPoints) {
    setStarPoints(goban, goban.starPoints.filter((star) => star.x !== x || star.y !== y));
  }
  return true;
}

/**
 * Every board index on the straight line from one point to another, both included. Pointer
 * events arrive only every so often, so a fast drag would otherwise skip points.
 */
export function gobanLine(width: number, from: number, to: number): number[] {
  const x0 = from % width;
  const y0 = Math.floor(from / width);
  const dx = to % width - x0;
  const dy = Math.floor(to / width) - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [from];
  return Array.from({ length: steps + 1 }, (_, step) => {
    const x = x0 + Math.round((dx * step) / steps);
    const y = y0 + Math.round((dy * step) / steps);
    return y * width + x;
  });
}

/** Makes every point land (playable) or water (removed). */
export function fillGoban(goban: CustomGoban, land: boolean): void {
  goban.points = goban.points.map(() => land ? 0 : -1);
  if (!land) delete goban.starPoints;
}

/** Resizes from the top-left corner, keeping the drawn shape; new points start as land. */
export function resizeGoban(goban: CustomGoban, width: number, height: number): void {
  const nextWidth = clampSize(width);
  const nextHeight = clampSize(height);
  const next = Array(nextWidth * nextHeight).fill(0);
  for (let y = 0; y < Math.min(nextHeight, goban.height); y++) {
    for (let x = 0; x < Math.min(nextWidth, goban.width); x++) {
      next[y * nextWidth + x] = goban.points[y * goban.width + x];
    }
  }
  goban.width = nextWidth;
  goban.height = nextHeight;
  goban.points = next;
  if (goban.starPoints) {
    setStarPoints(
      goban,
      goban.starPoints.filter((star) => star.x < nextWidth && star.y < nextHeight),
    );
  }
}

/** Star points as shown: the board's own, or the standard ones for 9/13/19 squares. */
export function gobanStarPoints(goban: CustomGoban): Array<{ x: number; y: number }> {
  return starPointCoords(gobanAsBoard(goban));
}

/** "361 points · 1 island", plus a phone warning for boards over 19×19. */
export function gobanSummary(goban: CustomGoban): string {
  const points = playablePointCount(goban.points);
  const islands = islandCount(goban.width, goban.height, goban.points);
  const summary = `${goban.width}×${goban.height} · ${points} point${points === 1 ? "" : "s"} · ` +
    `${islands} island${islands === 1 ? "" : "s"}`;
  return exceedsPhoneFriendlySize(goban.width, goban.height)
    ? `${summary}<span class="custom-goban-warning">Larger than 19×19: stones will be small and ` +
      `hard to play on phones.</span>`
    : summary;
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
    refreshCustomGobanPreset();
  };
  autosave();
  let tool: GobanTool = "land";
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog custom-goban-editor";
  // Desktop: controls, summary and an in-game preview on the left, the board large on the right.
  // Phones: everything stacks and the preview is hidden (the board itself is the preview).
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">×</button>
    <div class="custom-goban-layout">
    <div class="custom-goban-side">
    <div class="custom-goban-controls">
      <div class="custom-goban-tools" role="radiogroup" aria-label="Paint">
        <button data-tool="land" type="button" role="radio">Land</button>
        <button data-tool="water" type="button" role="radio">Water</button>
        <button data-tool="star" type="button" role="radio">Star</button>
      </div>
      <div class="custom-goban-fill">
        <button data-goban="all-land" type="button">All land</button>
        <button data-goban="all-water" type="button">All water</button>
      </div>
      <div class="custom-goban-size">
        <span>W</span>
        <button data-goban="width-down" type="button" aria-label="Narrower">−</button>
        <output data-goban-width></output>
        <button data-goban="width-up" type="button" aria-label="Wider">+</button>
        <span>H</span>
        <button data-goban="height-down" type="button" aria-label="Shorter">−</button>
        <output data-goban-height></output>
        <button data-goban="height-up" type="button" aria-label="Taller">+</button>
      </div>
      <label class="custom-goban-preset">
        Preset
        <select data-goban-preset aria-label="Load a preset board">
          <option value="">Choose…</option>${presetOptionsHtml()}
        </select>
      </label>
      <div class="custom-goban-actions">
        <button data-goban="reset" type="button">Reset</button>
        <button data-goban="copy" type="button">Copy</button>
        <button data-goban="paste" type="button">Paste</button>
        <button data-goban="save" type="button">Save</button>
      </div>
    </div>
    <p class="custom-goban-summary" aria-live="polite"></p>
    <figure class="custom-goban-preview">
      <figcaption>In game</figcaption>
      <div class="custom-goban-preview-board"></div>
    </figure>
    </div>
    <div class="custom-goban-board-wrap"></div>
    </div>
  `;
  document.body.append(dialog);
  const wrap = dialog.querySelector<HTMLElement>(".custom-goban-board-wrap")!;
  const summary = dialog.querySelector<HTMLElement>(".custom-goban-summary")!;

  const preview = dialog.querySelector<HTMLElement>(".custom-goban-preview-board")!;
  const renderInfo = () => {
    summary.innerHTML = gobanSummary(goban);
    preview.innerHTML = gamePreviewHtml(goban);
    dialog.querySelector("[data-goban-width]")!.textContent = String(goban.width);
    dialog.querySelector("[data-goban-height]")!.textContent = String(goban.height);
    for (const button of dialog.querySelectorAll<HTMLElement>("[data-tool]")) {
      const active = button.dataset.tool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    }
  };
  const render = () => {
    wrap.innerHTML = customBoardHtml(goban, true);
    renderInfo();
  };
  /** While painting, only the touched point and the lines change. */
  const refreshPoint = (index: number) => {
    const board = wrap.querySelector<HTMLElement>(".custom-goban-board");
    board?.querySelector(`[data-index="${index}"]`)?.classList.toggle(
      "is-water",
      goban.points[index] === -1,
    );
    board?.classList.toggle("has-water", goban.points.includes(-1));
    const lines = board?.querySelector<HTMLElement>(".custom-goban-lines");
    if (lines) lines.innerHTML = customBoardLinesHtml(goban);
    renderInfo();
  };

  // Paint by tapping or dragging; Star toggles on tap only.
  let painting = false;
  let lastPainted: number | undefined;
  const paintAt = (event: PointerEvent) => {
    const board = wrap.querySelector<HTMLElement>(".custom-goban-board");
    const index = board ? gobanIndexAt(board, goban, event.clientX, event.clientY) : undefined;
    if (index === undefined || index === lastPainted) return;
    // Fill in the points between pointer events so a quick stroke has no gaps.
    const stroke = lastPainted === undefined ? [index] : gobanLine(goban.width, lastPainted, index);
    lastPainted = index;
    const changed = stroke.filter((point) => paintGobanPoint(goban, point, tool));
    if (changed.length === 0) return;
    autosave();
    for (const point of changed) refreshPoint(point);
  };
  wrap.addEventListener("pointerdown", (event) => {
    if (!(event.target as Element | null)?.closest(".custom-goban-board")) return;
    event.preventDefault();
    wrap.setPointerCapture(event.pointerId);
    painting = tool !== "star";
    lastPainted = undefined;
    paintAt(event);
  });
  wrap.addEventListener("pointermove", (event) => {
    if (painting) paintAt(event);
  });
  const stopPainting = () => {
    painting = false;
    lastPainted = undefined;
  };
  wrap.addEventListener("pointerup", stopPainting);
  wrap.addEventListener("pointercancel", stopPainting);

  const change = (update: () => void) => {
    update();
    autosave();
    render();
  };
  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const toolButton = target?.closest<HTMLElement>("[data-tool]");
    if (toolButton) {
      tool = toolButton.dataset.tool as GobanTool;
      renderInfo();
      return;
    }
    const action = target?.closest<HTMLElement>("[data-goban]")?.dataset.goban;
    if (!action) return;
    if (action === "all-land") change(() => fillGoban(goban, true));
    if (action === "all-water") change(() => fillGoban(goban, false));
    if (action === "width-up") change(() => resizeGoban(goban, goban.width + 1, goban.height));
    if (action === "width-down") change(() => resizeGoban(goban, goban.width - 1, goban.height));
    if (action === "height-up") change(() => resizeGoban(goban, goban.width, goban.height + 1));
    if (action === "height-down") change(() => resizeGoban(goban, goban.width, goban.height - 1));
    if (action === "reset") {
      change(() => {
        Object.assign(goban, emptyGoban(size));
        delete goban.starPoints;
      });
    }
    if (action === "save") {
      autosave();
      dialog.close();
    }
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement, "Copied");
    if (action === "paste") {
      navigator.clipboard?.readText().then((text) => {
        change(() => {
          const pasted = parseCustomGoban(text, size);
          goban.width = pasted.width;
          goban.height = pasted.height;
          goban.points = pasted.points;
          if (pasted.starPoints) goban.starPoints = pasted.starPoints;
          else delete goban.starPoints;
        });
      });
    }
    if (action === "close") dialog.close();
  });
  dialog.querySelector<HTMLSelectElement>("[data-goban-preset]")?.addEventListener(
    "change",
    (event) => {
      const select = event.target as HTMLSelectElement;
      const preset = presetGoban(select.value);
      select.value = "";
      if (!preset) return;
      change(() => {
        delete goban.starPoints;
        Object.assign(goban, preset);
      });
    },
  );
  dialog.addEventListener("close", () => dialog.remove());
  render();
  dialog.showModal();
}

/**
 * How the board will look in a game: trimmed to the land, plain wood, no water tint. Only the
 * lines and star points, so it is cheap to redraw while painting.
 */
function gamePreviewHtml(goban: CustomGoban): string {
  const board = gobanAsBoard(goban);
  const frame = boardFrame(board, false);
  const water = goban.points.includes(-1) ? " has-water" : "";
  return `<div class="board custom-goban-preview-surface${water}" role="img" ` +
    `aria-label="In-game preview" style="--board-step: ${frame.stepX}%; ` +
    `--board-aspect: ${frame.aspectRatio}">${boardLandHtml(board, frame)}` +
    `${boardGridHtml(board, false, frame)}${starPointsHtml(board, false, frame)}</div>`;
}

/** The board as the game draws it (wood, grid, star points), plus a button per point. */
function customBoardHtml(goban: CustomGoban, editable: boolean): string {
  const board = gobanAsBoard(goban);
  const frame = editorFrame(goban);
  const points = goban.points.map((point, index) => {
    const position = pointPosition(board, index, frame);
    const x = index % goban.width;
    const y = Math.floor(index / goban.width);
    return `<span class="custom-point${point === -1 ? " is-water" : ""}" data-index="${index}" ` +
      `style="left:${position.left}%;top:${position.top}%" aria-hidden="true" data-x="${x}" ` +
      `data-y="${y}"></span>`;
  }).join("");
  const water = goban.points.includes(-1) ? " has-water" : "";
  return `<div class="board custom-goban-board${editable ? " is-editable" : ""}${water}" ` +
    `role="img" ` +
    `aria-label="Custom board, ${goban.width} by ${goban.height}" style="--board-step: ${frame.stepX}%; ` +
    `--board-step-y: ${frame.stepY}%; --board-aspect: ${frame.aspectRatio}">` +
    `<div class="custom-goban-lines">${customBoardLinesHtml(goban)}</div>${points}</div>`;
}

function customBoardLinesHtml(goban: CustomGoban): string {
  const board = gobanAsBoard(goban);
  const frame = editorFrame(goban);
  return boardLandHtml(board, frame) + boardGridHtml(board, false, frame) +
    starPointsHtml(board, false, frame);
}

/** Equal line spacing like the game, but never trimmed: every point stays paintable. */
function editorFrame(goban: CustomGoban): BoardFrame {
  return boardFrame(gobanAsBoard(goban), false, false);
}

/** The point under a pointer, by the same geometry the board is drawn with. */
function gobanIndexAt(
  board: HTMLElement,
  goban: CustomGoban,
  clientX: number,
  clientY: number,
): number | undefined {
  const rect = board.getBoundingClientRect();
  const { gx, gy } = frameGridCoords(
    editorFrame(goban),
    ((clientX - rect.left) / rect.width) * 100,
    ((clientY - rect.top) / rect.height) * 100,
  );
  const x = Math.round(gx);
  const y = Math.round(gy);
  if (x < 0 || y < 0 || x >= goban.width || y >= goban.height) return undefined;
  return y * goban.width + x;
}

/** The board shape in the form the shared board renderer reads. */
function gobanAsBoard(goban: CustomGoban): BoardLike {
  return {
    boardWidth: goban.width,
    boardHeight: goban.height,
    board: goban.points,
    config: { customGoban: goban.starPoints ? { starPoints: goban.starPoints } : {} },
  };
}

function setStarPoints(goban: CustomGoban, stars: Array<{ x: number; y: number }>): void {
  if (stars.length) goban.starPoints = stars;
  else delete goban.starPoints;
}

function clampSize(value: number): number {
  return Math.min(CUSTOM_BOARD_MAX_SIZE, Math.max(CUSTOM_BOARD_MIN_SIZE, Math.round(value)));
}

function normalizeCustomGoban(value: unknown, fallbackSize: number): CustomGoban {
  if (!value || typeof value !== "object") return emptyGoban(fallbackSize);
  const custom = value as Partial<CustomGoban>;
  const width = boundedInteger(
    custom.width,
    CUSTOM_BOARD_MIN_SIZE,
    CUSTOM_BOARD_MAX_SIZE,
    fallbackSize,
  );
  const height = boundedInteger(
    custom.height,
    CUSTOM_BOARD_MIN_SIZE,
    CUSTOM_BOARD_MAX_SIZE,
    fallbackSize,
  );
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
