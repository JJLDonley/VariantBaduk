/**
 * Close any open modal <dialog> when the user clicks on its backdrop (outside the box).
 * Both the press and the release must land outside, so dragging out of a dialog
 * (e.g. selecting text) doesn't close it. Installed once for every dialog in the app.
 */
export function installDialogLightDismiss(root: Document = document): void {
  let pressedBackdrop: HTMLDialogElement | undefined;
  root.addEventListener("pointerdown", (event) => {
    pressedBackdrop = backdropDialog(event);
  });
  root.addEventListener("click", (event) => {
    const dialog = backdropDialog(event);
    if (dialog && dialog === pressedBackdrop) dialog.close();
    pressedBackdrop = undefined;
  });
}

function backdropDialog(event: MouseEvent): HTMLDialogElement | undefined {
  const target = event.target;
  if (!(target instanceof HTMLDialogElement) || !target.open) return undefined;
  const rect = target.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  return inside ? undefined : target;
}
