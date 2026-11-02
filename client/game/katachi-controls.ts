/** Katachi "Full" controls, saved per browser like the sound settings. */
export type KatachiControls = {
  /** Mouse button that places the card; the other one rotates it. */
  placeButton: "left" | "right";
  rotateKey: string;
  mirrorKey: string;
};

const DEFAULTS: KatachiControls = { placeButton: "left", rotateKey: "r", mirrorKey: "f" };

export function readKatachiControls(): KatachiControls {
  try {
    const placeButton = localStorage.getItem("baduk:katachi-place-button") === "right"
      ? "right"
      : "left";
    return {
      placeButton,
      rotateKey: validKey(localStorage.getItem("baduk:katachi-rotate-key")) ?? DEFAULTS.rotateKey,
      mirrorKey: validKey(localStorage.getItem("baduk:katachi-mirror-key")) ?? DEFAULTS.mirrorKey,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveKatachiControls(controls: KatachiControls): void {
  try {
    localStorage.setItem("baduk:katachi-place-button", controls.placeButton);
    localStorage.setItem("baduk:katachi-rotate-key", controls.rotateKey);
    localStorage.setItem("baduk:katachi-mirror-key", controls.mirrorKey);
  } catch {
    // Settings just won't persist (private window / blocked storage).
  }
}

/** Mouse button (PointerEvent.button) that places: 0 = left, 2 = right. */
export function placeMouseButton(controls = readKatachiControls()): number {
  return controls.placeButton === "right" ? 2 : 0;
}

export function rotateMouseButton(controls = readKatachiControls()): number {
  return controls.placeButton === "right" ? 0 : 2;
}

function validKey(value: string | null): string | undefined {
  const key = value?.trim().toLowerCase();
  return key && key.length === 1 ? key : undefined;
}
