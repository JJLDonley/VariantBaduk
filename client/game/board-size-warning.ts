import type { BoardLike } from "./board-utils.ts";
import { boardFrame } from "./board-utils.ts";
import { exceedsPhoneFriendlySize } from "../shared/custom-board.ts";

/** Same breakpoint as the stacked phone layout in responsive.css. */
const PHONE_QUERY = "(max-width: 759px)";

/**
 * Whether a phone user should be told this board may render small: it is larger than 19×19 as
 * shown (after outer water is trimmed, which is what actually has to fit the screen).
 */
export function shouldWarnAboutBoardSize(
  game: BoardLike,
  isPhone = matchMedia(PHONE_QUERY).matches,
): boolean {
  if (!isPhone) return false;
  const frame = boardFrame(game, false);
  return exceedsPhoneFriendlySize(frame.columns, frame.rows);
}

/**
 * Before seating a phone user on a large board, asks whether to join anyway. Resolves true to go
 * ahead; closing the dialog (Escape, tapping outside) counts as Cancel.
 */
export function confirmJoinOnPhone(game: BoardLike): Promise<boolean> {
  if (!shouldWarnAboutBoardSize(game)) return Promise.resolve(true);
  const frame = boardFrame(game, false);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ui-dialog board-size-dialog";
    dialog.innerHTML = `
      <h3>Large board</h3>
      <p>This board is ${frame.columns}×${frame.rows}, larger than 19×19. On a phone the stones
        will be small and may be hard to tap.</p>
      <div class="board-size-dialog__actions">
        <button type="button" data-choice="cancel">Cancel</button>
        <button type="button" data-choice="join">Join anyway</button>
      </div>
    `;
    let joined = false;
    dialog.addEventListener("click", (event) => {
      const choice = (event.target as Element | null)?.closest<HTMLElement>("[data-choice]")
        ?.dataset.choice;
      if (!choice) return;
      joined = choice === "join";
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(joined);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
