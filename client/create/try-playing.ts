import { VARIANT_KEYS, VARIANT_LABELS, type VariantKey } from "../shared/variant-conflicts.ts";
import { ruleSentences, variantRuleText } from "../game/variants.ts";
import { escapeHtml } from "../ui/format.ts";
import { applyGobanPreset } from "./custom-goban.ts";
import { updateBoardSizeButtons, updateVariantOptions } from "./form.ts";
import { GOBAN_PRESETS } from "./goban-presets.ts";

/** Something to suggest: a variant or a preset board. */
export type TryPlayingSuggestion =
  | { kind: "variant"; id: VariantKey; name: string; rules: string[] }
  | { kind: "board"; id: string; name: string; rules: string[] };

/** Everything playable is suggested, so new variants and presets are included automatically. */
export const TRY_PLAYING_SUGGESTIONS: readonly TryPlayingSuggestion[] = [
  ...VARIANT_KEYS.map((id) => ({
    kind: "variant" as const,
    id,
    name: VARIANT_LABELS[id],
    rules: ruleSentences(variantRuleText(VARIANT_LABELS[id])),
  })),
  ...GOBAN_PRESETS.map(({ id, name, description }) => ({
    kind: "board" as const,
    id,
    name: `${name} board`,
    rules: [description],
  })),
];

export function pickSuggestion(random: () => number = Math.random): TryPlayingSuggestion {
  const index = Math.floor(random() * TRY_PLAYING_SUGGESTIONS.length);
  return TRY_PLAYING_SUGGESTIONS[Math.min(index, TRY_PLAYING_SUGGESTIONS.length - 1)];
}

const NEVER_KEY = "baduk:try-playing-closed";

/** Until closed for good. Blocked storage means no popup, as that choice couldn't be kept. */
export function shouldShowTryPlaying(permanent: Pick<Storage, "getItem">): boolean {
  try {
    return permanent.getItem(NEVER_KEY) === null;
  } catch {
    return false;
  }
}

function closeForGood(): void {
  try {
    localStorage.setItem(NEVER_KEY, "true");
  } catch {
    // Blocked storage: shouldShowTryPlaying won't show it next time anyway.
  }
}

/** Opens the popup each time the create screen appears, until closed for good. */
export function showTryPlaying(): void {
  removeTryPlaying();
  if (!shouldShowTryPlaying(localStorage)) return;
  const suggestion = pickSuggestion();
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog try-playing";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" data-try="close" aria-label="Close">×</button>
    <h3>Try playing: ${escapeHtml(suggestion.name)}</h3>
    <h4>How it plays</h4>
    <ul class="dialog-scroll" tabindex="0">
      ${suggestion.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}
    </ul>
    <div class="try-playing__actions">
      <button type="button" data-try="never">Don't show again</button>
      <button type="button" data-try="go" autofocus>Try it</button>
    </div>
  `;
  dialog.addEventListener("click", (event) => {
    const action = (event.target as Element | null)?.closest<HTMLElement>("[data-try]")?.dataset
      .try;
    if (!action) return;
    dialog.close();
    if (action === "go") applySuggestion(suggestion);
    if (action === "never") closeForGood();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/** The popup only belongs on the create screen. */
export function removeTryPlaying(): void {
  document.querySelector(".try-playing")?.remove();
}

/** Selects the suggestion in the create form; the player still reviews it and presses Create. */
function applySuggestion(suggestion: TryPlayingSuggestion): void {
  for (const input of document.querySelectorAll<HTMLInputElement>(".variant-buttons input")) {
    input.checked = false;
  }
  const customBoard = document.querySelector<HTMLInputElement>("[name='customGobanMode']");
  if (customBoard) customBoard.checked = false;
  let shown: Element | null = null;
  if (suggestion.kind === "board") {
    const select = document.querySelector<HTMLSelectElement>("[name='gobanPreset']");
    if (select) select.value = suggestion.id;
    applyGobanPreset();
    shown = document.querySelector(".custom-board-settings");
    updateVariantOptions();
  } else {
    const input = document.querySelector<HTMLInputElement>(`[name='${suggestion.id}']`);
    if (input) {
      input.checked = true;
      // The form's own listeners apply its options and conflict rules.
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    shown = input?.closest(".variant-button") ?? null;
  }
  updateBoardSizeButtons();
  shown?.scrollIntoView({ block: "center" });
}
