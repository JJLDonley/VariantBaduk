import {
  cycleCreatorSeat,
  updateCreatorSeatOptions,
  updateRuleDefaults,
  updateTimeOptions,
  updateVariantOptions,
} from "./form.ts";
import { openCustomGobanEditor } from "./custom-goban.ts";
import { openJosekiCardDialog } from "./joseki-card-dialog.ts";

export function bindCreateGameForm(
  submitHandler: (event: SubmitEvent) => void | Promise<void>,
  statusElement: Element | null,
  root: ParentNode = document,
): void {
  root.querySelector<HTMLFormElement>("#create-game-form")?.addEventListener(
    "submit",
    submitHandler as EventListener,
  );
  root.querySelector("[name='timeSystem']")?.addEventListener("change", updateTimeOptions);
  root.querySelector("[name='ruleset']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='handicap']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='boardSize']")?.addEventListener("change", updateVariantOptions);
  root.querySelector("[name='colorGoPlayerCount']")?.addEventListener("change", () => {
    updateVariantOptions();
    updateCreatorSeatOptions();
  });
  root.querySelector("[name='zenPlayerCount']")?.addEventListener(
    "change",
    updateCreatorSeatOptions,
  );
  root.querySelector("[name='nPlusOneCount']")?.addEventListener("input", updateVariantOptions);
  root.querySelector(".custom-goban-open")?.addEventListener(
    "click",
    () => openCustomGobanEditor(statusElement),
  );
  root.querySelector(".joseki-card-open")?.addEventListener(
    "click",
    () => openJosekiCardDialog(statusElement),
  );
  root.querySelector("[data-seat-toggle]")?.addEventListener("click", cycleCreatorSeat);
  for (const input of root.querySelectorAll(".variant-button input")) {
    input.addEventListener("change", updateVariantOptions);
    input.addEventListener("change", updateCreatorSeatOptions);
  }
  refreshCreateGameForm();
}

export function refreshCreateGameForm(): void {
  updateTimeOptions();
  updateRuleDefaults();
  updateVariantOptions();
  updateCreatorSeatOptions();
}
