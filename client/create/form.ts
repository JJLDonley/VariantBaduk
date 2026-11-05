import {
  conflictingVariants,
  VARIANT_KEYS,
  variantConfigProblems,
} from "../shared/variant-conflicts.ts";
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

export function invalidVariantComboMessage(data: FormData): string {
  return variantConfigProblems({
    variants: {
      ...Object.fromEntries(VARIANT_KEYS.map((key) => [key, data.has(key)])),
      nPlusOneCount: Number(data.get("nPlusOneCount")),
    },
    boardSize: Number(data.get("boardSize")),
    customGoban: data.has("customGobanMode"),
    ruleset: String(data.get("ruleset") ?? ""),
    handicap: Number(data.get("handicap") ?? 0),
  })[0] ?? "";
}

function updateVariantConflicts(): void {
  const boardSize = document.querySelector<HTMLInputElement>("[name='boardSize']");
  const josekiCard = document.querySelector<HTMLInputElement>("[name='josekiCard']");
  const customGoban = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const tetris = document.querySelector<HTMLInputElement>("[name='tetris']");
  const nPlusOne = document.querySelector<HTMLInputElement>("[name='nPlusOne']");
  const nPlusOneCount = document.querySelector<HTMLInputElement>("[name='nPlusOneCount']");
  if (!boardSize || !josekiCard || !customGoban || !tetris || !nPlusOne || !nPlusOneCount) return;
  const variants = new Map(
    VARIANT_KEYS.flatMap((key) => {
      const input = document.querySelector<HTMLInputElement>(`[name='${key}']`);
      return input ? [[key, input] as const] : [];
    }),
  );
  // When two clashing variants are both checked, keep the one just clicked.
  for (const [key, input] of variants) {
    for (const other of conflictingVariants(key)) {
      const otherInput = variants.get(other);
      if (otherInput) resolveExclusivePair(input, otherInput);
    }
  }
  if (josekiCard.checked) {
    boardSize.value = "19";
    if (customGoban.checked) customGoban.checked = false;
  }
  const tetrisBlockedByNPlusOne = nPlusOne.checked && Number(nPlusOneCount.value) === 4;
  if (tetrisBlockedByNPlusOne && tetris.checked) tetris.checked = false;
  // Every button's state is recomputed on each change, so unchecking a variant re-enables
  // everything it was blocking.
  for (const [key, input] of variants) {
    setVariantDisabled(
      input,
      conflictingVariants(key).some((other) => variants.get(other)?.checked),
    );
  }
  if (tetrisBlockedByNPlusOne) setVariantDisabled(tetris, true);
  if (customGoban.checked) setVariantDisabled(josekiCard, true);
  setVariantDisabled(customGoban, josekiCard.checked);
  boardSize.setCustomValidity(
    josekiCard.checked && Number(boardSize.value) !== 19
      ? "Joseki Card requires a 19×19 board."
      : "",
  );
  nPlusOneCount.setCustomValidity(
    tetris.checked && Number(nPlusOneCount.value) === 4 ? "Tetris cannot use N+1 count 4." : "",
  );
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
