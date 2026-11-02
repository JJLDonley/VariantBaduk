import { nearestColorName } from "../ui/color-names.ts";

type SeatOption = { value: string; label: string };

export function selectBoardSizeOption(event: Event): void {
  const button = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>(
    "[data-board-size-option]",
  );
  const option = button?.dataset.boardSizeOption;
  const boardSize = document.querySelector<HTMLInputElement>("[name='boardSize']");
  const customGoban = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  if (!option || !boardSize || !customGoban) return;
  if (option === "cgoban") {
    customGoban.checked = true;
  } else {
    boardSize.value = option;
    customGoban.checked = false;
  }
  updateBoardSizeButtons();
  updateVariantOptions();
}

export function updateBoardSizeButtons(): void {
  const boardSize = document.querySelector<HTMLInputElement>("[name='boardSize']");
  const customGoban = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const selected = customGoban?.checked ? "cgoban" : boardSize?.value;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-board-size-option]")) {
    const active = button.dataset.boardSizeOption === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.boardSizeOption === "cgoban") {
      button.disabled = Boolean(customGoban?.disabled);
    }
  }
}

export function cycleCreatorSeat(event: Event): void {
  const input = document.querySelector<HTMLInputElement>("[name='creatorSeat']");
  if (!input) return;
  const options = creatorSeatOptions();
  const index = options.findIndex((option) => option.value === input.value);
  const next = options[(index + 1) % options.length] ?? options[0];
  input.value = next.value;
  const button = event.currentTarget as HTMLElement | null;
  if (button) button.textContent = `Seat: ${next.label}`;
}

export function updateCreatorSeatOptions(): void {
  const input = document.querySelector<HTMLInputElement>("[name='creatorSeat']");
  const button = document.querySelector<HTMLElement>("[data-seat-toggle]");
  if (!input || !button) return;
  const options = creatorSeatOptions();
  const selected = options.find((option) => option.value === input.value) ?? options[0];
  input.value = selected.value;
  button.textContent = `Seat: ${selected.label}`;
}

function creatorSeatOptions(): SeatOption[] {
  const color = document.querySelector<HTMLInputElement>("[name='colorGo']")?.checked;
  const zen = document.querySelector<HTMLInputElement>("[name='zen']")?.checked;
  const teamGo = document.querySelector<HTMLInputElement>("[name='teamGo']")?.checked;
  if (teamGo) return teamGoSeatOptions();
  if (color) {
    const count = Number(
      document.querySelector<HTMLInputElement>("[name='colorGoPlayerCount']")?.value ?? 3,
    );
    return multiplayerSeatOptions(count);
  }
  if (zen) {
    const count = Number(
      document.querySelector<HTMLInputElement>("[name='zenPlayerCount']")?.value ?? 3,
    );
    return multiplayerSeatOptions(count);
  }
  return [
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
    { value: "none", label: "None" },
  ];
}

function teamGoSeatOptions(): SeatOption[] {
  const colorGoEnabled = document.querySelector<HTMLInputElement>("[name='colorGo']")?.checked;
  const teamCount = colorGoEnabled
    ? Number(document.querySelector<HTMLInputElement>("[name='colorGoPlayerCount']")?.value ?? 3)
    : 2;
  const labels = Array.from({ length: teamCount }, (_, index) => {
    const color = document.querySelector<HTMLInputElement>(`[name='colorGoColor${index + 1}']`)
      ?.value;
    return nearestColorName(color ?? "#111111");
  });
  const options = labels.flatMap((label, teamIndex) => {
    const count = Number(
      document.querySelector<HTMLInputElement>(`[name='teamGoSeats${teamIndex + 1}']`)?.value ?? 0,
    );
    return Array.from({ length: Math.max(0, count) }, (_, seatIndex) => ({
      value: `team-${teamIndex + 1}-${seatIndex + 1}`,
      label: `${label} ${seatIndex + 1}`,
    }));
  });
  return [...options, { value: "none", label: "None" }];
}

function multiplayerSeatOptions(count: number): SeatOption[] {
  return [
    ...Array.from(
      { length: count },
      (_, index) => ({ value: `player-${index + 1}`, label: `P${index + 1}` }),
    ),
    { value: "none", label: "None" },
  ];
}

export function updateColorGoKomiDefaults(): void {
  const count = Number(
    document.querySelector<HTMLInputElement>("[name='colorGoPlayerCount']")?.value ?? 2,
  );
  const defaults = count >= 4 ? [0, 3.5, 5.5, 7.5] : count === 3 ? [0, 5.5, 7.5] : [0, 7.5];
  for (let team = 2; team <= 4; team++) {
    const input = document.querySelector<HTMLInputElement>(`[name='colorGoKomi${team}']`);
    if (input) input.value = String(defaults[team - 1] ?? 0);
  }
}

export function updateTeamColorNames(root: ParentNode = document): void {
  for (let team = 1; team <= 4; team++) {
    const input = root.querySelector<HTMLInputElement>(`[name='colorGoColor${team}']`);
    if (!input) continue;
    const name = nearestColorName(input.value);
    const heading = root.querySelector<HTMLElement>(`[data-team-color-name='${team}']`);
    if (heading) heading.textContent = name;
    const label = root.querySelector<HTMLElement>(`[data-team-color-label='${team}']`);
    label?.setAttribute("aria-label", `${name} color`);
    input.title = name;
  }
}

export function updateTimeOptions(): void {
  const selected = document.querySelector<HTMLInputElement>("[name='timeSystem']")?.value ?? "none";
  for (const option of document.querySelectorAll<HTMLElement>("[data-time-option]")) {
    option.hidden = !(option.dataset.timeOption ?? "").split(" ").includes(selected);
  }
}

export function updateRuleDefaults(): void {
  const komi = document.querySelector<HTMLInputElement>("[name='komi']");
  const captures = document.querySelector<HTMLInputElement>("[name='capturesGivePoints']");
  const handicap = Number(
    document.querySelector<HTMLInputElement>("[name='handicap']")?.value ?? 0,
  );
  const rules = document.querySelector<HTMLInputElement>("[name='ruleset']")?.value;
  if (komi) {
    komi.value = handicap > 0 ? "0.5" : ["chinese", "aga"].includes(rules ?? "") ? "7.5" : "6.5";
  }
  if (captures) captures.checked = rules === "japanese";
}

export function updateVariantOptions(): void {
  updateTeamColorNames();
  updateVariantConflicts();
  updateBoardSizeButtons();
  const colorGoEnabled = document.querySelector<HTMLInputElement>("[name='colorGo']")?.checked;
  const teamGoEnabled = document.querySelector<HTMLInputElement>("[name='teamGo']")?.checked;
  const colorGoCount = colorGoEnabled
    ? Number(document.querySelector<HTMLInputElement>("[name='colorGoPlayerCount']")?.value ?? 3)
    : 2;
  for (const setup of document.querySelectorAll<HTMLElement>("[data-team-setup-options]")) {
    setup.hidden = !colorGoEnabled && !teamGoEnabled;
  }
  for (const control of document.querySelectorAll<HTMLElement>("[data-color-go-control]")) {
    control.hidden = !colorGoEnabled;
  }
  for (const input of document.querySelectorAll<HTMLElement>("[data-team-go-seat]")) {
    input.hidden = !teamGoEnabled;
  }
  for (const label of document.querySelectorAll<HTMLElement>("[data-team-go-seat-label]")) {
    label.hidden = !teamGoEnabled;
  }
  for (const option of document.querySelectorAll<HTMLElement>("[data-color-go-player]")) {
    const hidden = Number(option.dataset.colorGoPlayer) > colorGoCount;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const nPlusOneEnabled = document.querySelector<HTMLInputElement>("[name='nPlusOne']")?.checked;
  const hiddenEnabled = document.querySelector<HTMLInputElement>("[name='hiddenMove']")?.checked;
  const traitorEnabled = document.querySelector<HTMLInputElement>("[name='traitor']")?.checked;
  const phantomEnabled = document.querySelector<HTMLInputElement>("[name='phantomMove']")?.checked;
  for (const group of document.querySelectorAll<HTMLElement>("[data-variant-count-group]")) {
    group.hidden = !nPlusOneEnabled && !hiddenEnabled && !traitorEnabled;
  }
  const traitorMode = document.querySelector<HTMLSelectElement>("[name='traitorMode']")?.value ??
    "moves";
  for (
    const input of document.querySelectorAll<HTMLInputElement>("[data-traitor-mode-value]")
  ) {
    const hidden = input.dataset.traitorModeValue !== traitorMode;
    input.hidden = hidden;
    input.disabled = hidden;
  }
  const invisibleStonesEnabled = Boolean(phantomEnabled || hiddenEnabled);
  for (const control of document.querySelectorAll<HTMLElement>("[data-invisible-stones-control]")) {
    control.hidden = !invisibleStonesEnabled;
    for (const input of control.querySelectorAll<HTMLInputElement>("input")) {
      input.disabled = !invisibleStonesEnabled;
    }
  }
  const scroller = document.querySelector<HTMLElement>(".panel-card");
  const scrollTop = scroller?.scrollTop ?? 0;
  for (const option of document.querySelectorAll<HTMLElement>("[data-variant-option]")) {
    const input = document.querySelector<HTMLInputElement>(
      `[name='${option.dataset.variantOption}']`,
    );
    const hidden = !input?.checked;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const divider = document.querySelector<HTMLElement>("[data-variant-options-divider]");
  if (divider) divider.hidden = false;
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTop = scrollTop;
    scrollTo(0, 0);
  });
}

const SHAPE_CARD_BLOCKED = [
  ["pixel", "Pixel"],
  ["nPlusOne", "N+1"],
  ["traitor", "Traitor"],
  ["tetris", "Tetris"],
  ["zen", "Zen"],
  ["colorGo", "Color Go"],
  ["hiddenMove", "Hidden"],
  ["phantomMove", "Phantom"],
] as const;

export function invalidVariantComboMessage(data: FormData): string {
  if (data.has("josekiCard") && Number(data.get("boardSize")) !== 19) {
    return "Joseki Card requires a 19×19 board.";
  }
  if (
    data.has("josekiCard") &&
    (data.has("customGobanMode") || data.has("tetris") || data.has("zen") || data.has("colorGo"))
  ) {
    return "Joseki Card cannot be combined with Custom board, Tetris, Zen, or Color Go.";
  }
  if (data.has("hiddenMove") && data.has("zen")) return "Hidden cannot be combined with Zen.";
  if (data.has("zen") && data.has("colorGo")) return "Zen cannot be combined with Color Go.";
  if (data.has("teamGo") && data.has("zen")) {
    return "Team Go cannot be combined with Zen.";
  }
  if (data.has("shapeCards")) {
    const blocked = SHAPE_CARD_BLOCKED.filter(([name]) => data.has(name)).map(([, label]) => label);
    if (blocked.length) return `Katachi cannot be combined with ${blocked.join(", ")}.`;
    if (data.get("ruleset") === "chinese" && Number(data.get("handicap") ?? 0) > 1) {
      return "Katachi cannot be combined with free handicap placement.";
    }
  }
  if (data.has("tetris") && data.has("pixel")) return "Tetris cannot be combined with Pixel.";
  if (data.has("tetris") && data.has("nPlusOne") && Number(data.get("nPlusOneCount")) === 4) {
    return "Tetris cannot be combined with N+1 count 4.";
  }
  return "";
}

function updateVariantConflicts(): void {
  const boardSize = document.querySelector<HTMLInputElement>("[name='boardSize']");
  const josekiCard = document.querySelector<HTMLInputElement>("[name='josekiCard']");
  const customGoban = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const tetris = document.querySelector<HTMLInputElement>("[name='tetris']");
  const pixel = document.querySelector<HTMLInputElement>("[name='pixel']");
  const zen = document.querySelector<HTMLInputElement>("[name='zen']");
  const colorGo = document.querySelector<HTMLInputElement>("[name='colorGo']");
  const teamGo = document.querySelector<HTMLInputElement>("[name='teamGo']");
  const hiddenMove = document.querySelector<HTMLInputElement>("[name='hiddenMove']");
  const nPlusOne = document.querySelector<HTMLInputElement>("[name='nPlusOne']");
  const nPlusOneCount = document.querySelector<HTMLInputElement>("[name='nPlusOneCount']");
  if (
    !boardSize || !josekiCard || !customGoban || !tetris || !pixel || !zen || !colorGo ||
    !teamGo || !hiddenMove || !nPlusOne || !nPlusOneCount
  ) return;
  resolveExclusivePair(tetris, pixel);
  resolveExclusivePair(zen, colorGo);
  resolveExclusivePair(zen, teamGo);
  resolveExclusivePair(zen, hiddenMove);
  if (josekiCard.checked) {
    boardSize.value = "19";
    if (customGoban.checked) customGoban.checked = false;
    if (tetris.checked) tetris.checked = false;
    if (zen.checked) zen.checked = false;
    if (colorGo.checked) colorGo.checked = false;
  }
  const tetrisBlockedByNPlusOne = nPlusOne.checked && Number(nPlusOneCount.value) === 4;
  if (tetrisBlockedByNPlusOne && tetris.checked) tetris.checked = false;
  const tetrisChecked = tetris.checked;
  setVariantDisabled(pixel, tetrisChecked);
  setVariantDisabled(customGoban, josekiCard.checked);
  setVariantDisabled(tetris, pixel.checked || tetrisBlockedByNPlusOne || josekiCard.checked);
  setVariantDisabled(colorGo, zen.checked || josekiCard.checked);
  setVariantDisabled(teamGo, zen.checked);
  setVariantDisabled(hiddenMove, zen.checked);
  setVariantDisabled(
    zen,
    colorGo.checked || teamGo.checked || hiddenMove.checked || josekiCard.checked,
  );
  setVariantDisabled(
    josekiCard,
    customGoban.checked || tetris.checked || zen.checked || colorGo.checked,
  );
  boardSize.setCustomValidity(
    josekiCard.checked && Number(boardSize.value) !== 19
      ? "Joseki Card requires a 19×19 board."
      : "",
  );
  nPlusOneCount.setCustomValidity(
    tetrisChecked && Number(nPlusOneCount.value) === 4 ? "Tetris cannot use N+1 count 4." : "",
  );
  updateShapeCardConflicts();
}

function updateShapeCardConflicts(): void {
  const shapeCards = document.querySelector<HTMLInputElement>("[name='shapeCards']");
  if (!shapeCards) return;
  const blocked = SHAPE_CARD_BLOCKED
    .map(([name]) => document.querySelector<HTMLInputElement>(`[name='${name}']`))
    .filter((input): input is HTMLInputElement => Boolean(input));
  if (shapeCards.checked && document.activeElement === shapeCards) {
    for (const input of blocked) input.checked = false;
  }
  const anyBlocked = blocked.some((input) => input.checked);
  if (anyBlocked && shapeCards.checked) shapeCards.checked = false;
  if (shapeCards.checked) { for (const input of blocked) setVariantDisabled(input, true); }
  setVariantDisabled(shapeCards, anyBlocked);
}

function resolveExclusivePair(first: HTMLInputElement, second: HTMLInputElement): void {
  if (!first.checked || !second.checked) return;
  if (document.activeElement === first) second.checked = false;
  else first.checked = false;
}

function setVariantDisabled(input: HTMLInputElement, disabled: boolean): void {
  input.disabled = disabled;
  input.closest(".variant-button")?.classList.toggle("is-disabled", disabled);
}
