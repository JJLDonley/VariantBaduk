type SeatOption = { value: string; label: string };

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

function multiplayerSeatOptions(count: number): SeatOption[] {
  return [
    ...Array.from(
      { length: count },
      (_, index) => ({ value: `player-${index + 1}`, label: `P${index + 1}` }),
    ),
    { value: "none", label: "None" },
  ];
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
  updateVariantConflicts();
  const colorGoCount = Number(
    document.querySelector<HTMLInputElement>("[name='colorGoPlayerCount']")?.value ?? 3,
  );
  for (const option of document.querySelectorAll<HTMLElement>("[data-color-go-player]")) {
    const hidden = Number(option.dataset.colorGoPlayer) > colorGoCount;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const scroller = document.querySelector<HTMLElement>(".panel-card");
  const scrollTop = scroller?.scrollTop ?? 0;
  for (const option of document.querySelectorAll<HTMLElement>("[data-variant-option]")) {
    const input = document.querySelector<HTMLInputElement>(
      `[name='${option.dataset.variantOption}']`,
    );
    option.hidden = !input?.checked;
  }
  const divider = document.querySelector<HTMLElement>("[data-variant-options-divider]");
  if (divider) divider.hidden = false;
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTop = scrollTop;
    scrollTo(0, 0);
  });
}

export function invalidVariantComboMessage(data: FormData): string {
  if (data.has("josekiCard") && Number(data.get("boardSize")) !== 19) {
    return "Joseki Card requires a 19×19 board.";
  }
  if (
    data.has("josekiCard") &&
    (data.has("customGobanMode") || data.has("tetris") || data.has("zen") || data.has("colorGo"))
  ) {
    return "Joseki Card cannot be combined with CGoban, Tetris, Zen, or Color Go.";
  }
  if (data.has("hiddenMove") && data.has("zen")) return "Hidden cannot be combined with Zen.";
  if (data.has("zen") && data.has("colorGo")) return "Zen cannot be combined with Color Go.";
  if (data.has("tetris") && data.has("pixel")) return "Tetris cannot be combined with Pixel.";
  if (data.has("tetris") && data.has("nPlusOne") && Number(data.get("nPlusOneCount")) === 4) {
    return "Tetris cannot be combined with N+1 count 4.";
  }
  return "";
}

function updateVariantConflicts(): void {
  const boardSize = document.querySelector<HTMLSelectElement>("[name='boardSize']");
  const josekiCard = document.querySelector<HTMLInputElement>("[name='josekiCard']");
  const customGoban = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  const tetris = document.querySelector<HTMLInputElement>("[name='tetris']");
  const pixel = document.querySelector<HTMLInputElement>("[name='pixel']");
  const zen = document.querySelector<HTMLInputElement>("[name='zen']");
  const colorGo = document.querySelector<HTMLInputElement>("[name='colorGo']");
  const hiddenMove = document.querySelector<HTMLInputElement>("[name='hiddenMove']");
  const nPlusOne = document.querySelector<HTMLInputElement>("[name='nPlusOne']");
  const nPlusOneCount = document.querySelector<HTMLInputElement>("[name='nPlusOneCount']");
  if (
    !boardSize || !josekiCard || !customGoban || !tetris || !pixel || !zen || !colorGo ||
    !hiddenMove || !nPlusOne || !nPlusOneCount
  ) return;
  resolveExclusivePair(tetris, pixel);
  resolveExclusivePair(zen, colorGo);
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
  setVariantDisabled(hiddenMove, zen.checked);
  setVariantDisabled(zen, colorGo.checked || hiddenMove.checked || josekiCard.checked);
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
