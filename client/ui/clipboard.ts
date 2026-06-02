export async function copyText(
  text: string,
  button: EventTarget | null,
  statusElement: Element | null,
  confirmation = "Copied",
): Promise<void> {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) copied = fallbackCopyText(text);
  if (!copied) showManualCopyDialog(text);
  if (statusElement) statusElement.textContent = copied ? `${confirmation}: ${text}` : `Copy manually: ${text}`;
  if (!(button instanceof HTMLElement)) return;
  const original = button.textContent;
  button.classList.toggle("is-confirmed", copied);
  button.textContent = copied ? confirmation : "Copy failed";
  setTimeout(() => {
    button.classList.remove("is-confirmed");
    button.textContent = original;
  }, 1200);
}

function fallbackCopyText(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.opacity = "0.01";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function showManualCopyDialog(text: string): void {
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog invite-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" data-copy-close type="button" aria-label="Close">×</button>
    <h3>Copy invite link</h3>
    <input data-copy-input readonly value="${text}" />
  `;
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest("[data-copy-close]")) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  const input = dialog.querySelector<HTMLInputElement>("[data-copy-input]");
  input?.focus();
  input?.select();
}
