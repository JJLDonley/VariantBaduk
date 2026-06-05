import {
  cycleCreatorSeat,
  selectBoardSizeOption,
  updateBoardSizeButtons,
  updateColorGoKomiDefaults,
  updateCreatorSeatOptions,
  updateRuleDefaults,
  updateTimeOptions,
  updateVariantOptions,
} from "./form.ts";
import {
  openCustomGobanEditor,
  refreshCustomGobanPresetButtons,
  restoreCustomGobanAutosave,
  toggleCircloidGoban,
} from "./custom-goban.ts";
import { openJosekiCardDialog } from "./joseki-card-dialog.ts";

export function bindCreateGameForm(
  submitHandler: (event: SubmitEvent) => void | Promise<void>,
  statusElement: Element | null,
  root: ParentNode = document,
): void {
  restoreCustomGobanAutosave(root);
  refreshCustomGobanPresetButtons(root);
  root.querySelector<HTMLFormElement>("#create-game-form")?.addEventListener(
    "submit",
    submitHandler as EventListener,
  );
  root.querySelector("[name='timeSystem']")?.addEventListener("change", updateTimeOptions);
  root.querySelector("[name='ruleset']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='handicap']")?.addEventListener("change", updateRuleDefaults);
  for (const button of root.querySelectorAll("[data-board-size-option]")) {
    button.addEventListener("click", (event) => {
      selectBoardSizeOption(event);
      refreshCustomGobanPresetButtons(root);
    });
  }
  root.querySelector("[name='colorGoPlayerCount']")?.addEventListener("change", () => {
    updateColorGoKomiDefaults();
    updateVariantOptions();
    updateCreatorSeatOptions();
  });
  root.querySelector("[name='zenPlayerCount']")?.addEventListener(
    "change",
    updateCreatorSeatOptions,
  );
  root.querySelector("[name='nPlusOneCount']")?.addEventListener("input", updateVariantOptions);
  for (const input of root.querySelectorAll("[name^='teamGoSeats']")) {
    input.addEventListener("input", updateCreatorSeatOptions);
  }
  root.querySelector(".custom-goban-open")?.addEventListener(
    "click",
    () => openCustomGobanEditor(statusElement),
  );
  root.querySelector("[name='circloidGobanMode']")?.addEventListener(
    "change",
    () => toggleCircloidGoban(root),
  );
  root.querySelector(".joseki-card-open")?.addEventListener(
    "click",
    () => openJosekiCardDialog(statusElement),
  );
  root.querySelector("[data-seat-toggle]")?.addEventListener("click", cycleCreatorSeat);
  for (const input of root.querySelectorAll(".variant-button input")) {
    input.addEventListener("change", updateVariantOptions);
    input.addEventListener("change", updateCreatorSeatOptions);
    input.addEventListener("change", () => refreshCustomGobanPresetButtons(root));
  }
  refreshCreateGameForm();
}

export function refreshCreateGameForm(): void {
  updateTimeOptions();
  updateRuleDefaults();
  updateBoardSizeButtons();
  updateVariantOptions();
  updateCreatorSeatOptions();
  refreshCustomGobanPresetButtons();
}
