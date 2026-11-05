import {
  cycleCreatorSeat,
  selectBoardSizeOption,
  updateBoardSizeButtons,
  updateColorGoKomiDefaults,
  updateCreatorSeatOptions,
  updateRuleDefaults,
  updateTeamColorNames,
  updateTimeOptions,
  updateVariantOptions,
} from "./form.ts";
import {
  applyGobanPreset,
  openCustomGobanEditor,
  refreshCustomGobanPreset,
  restoreCustomGobanAutosave,
} from "./custom-goban.ts";
import { openJosekiCardDialog } from "./joseki-card-dialog.ts";
import { openShapeCardDialog } from "./shape-card-dialog.ts";

export function bindCreateGameForm(
  submitHandler: (event: SubmitEvent) => void | Promise<void>,
  statusElement: Element | null,
  root: ParentNode = document,
): void {
  restoreCustomGobanAutosave(root);
  refreshCustomGobanPreset(root);
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
      refreshCustomGobanPreset(root);
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
  root.querySelector("[name='traitorMode']")?.addEventListener("change", updateVariantOptions);
  for (const input of root.querySelectorAll("[name^='teamGoSeats']")) {
    input.addEventListener("input", updateCreatorSeatOptions);
  }
  for (const input of root.querySelectorAll("[name^='colorGoColor']")) {
    input.addEventListener("input", () => {
      updateTeamColorNames(root);
      updateCreatorSeatOptions();
    });
  }
  root.querySelector(".custom-goban-open")?.addEventListener(
    "click",
    () => openCustomGobanEditor(statusElement),
  );
  root.querySelector("[name='gobanPreset']")?.addEventListener(
    "change",
    () => applyGobanPreset(root),
  );
  root.querySelector(".shape-card-open")?.addEventListener(
    "click",
    () => openShapeCardDialog(statusElement),
  );
  root.querySelector(".joseki-card-open")?.addEventListener(
    "click",
    () => openJosekiCardDialog(statusElement),
  );
  root.querySelector("[data-seat-toggle]")?.addEventListener("click", cycleCreatorSeat);
  for (const input of root.querySelectorAll(".variant-button input")) {
    input.addEventListener("change", updateVariantOptions);
    input.addEventListener("change", updateCreatorSeatOptions);
    input.addEventListener("change", () => refreshCustomGobanPreset(root));
  }
  refreshCreateGameForm();
}

export function refreshCreateGameForm(): void {
  updateTimeOptions();
  updateRuleDefaults();
  updateBoardSizeButtons();
  updateTeamColorNames();
  updateVariantOptions();
  updateCreatorSeatOptions();
  refreshCustomGobanPreset();
}
