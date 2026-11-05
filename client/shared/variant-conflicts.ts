/**
 * Which variants can be played together: the single source for the server's config validation,
 * the create form's submit check, and the form's live disabling of variant buttons. Lives under
 * client/ so the client bundle (and the public repo, which only gets client/) has it; the server
 * imports it from here.
 */

export type VariantKey =
  | "pixel"
  | "zen"
  | "colorGo"
  | "phantomMove"
  | "hiddenMove"
  | "josekiCard"
  | "shapeCards"
  | "tetris"
  | "magnetic"
  | "nPlusOne"
  | "traitor"
  | "randomTurn"
  | "teamGo";

export const VARIANT_LABELS: Record<VariantKey, string> = {
  pixel: "Pixel",
  zen: "Zen",
  colorGo: "Color Go",
  phantomMove: "Phantom",
  hiddenMove: "Hidden",
  josekiCard: "Joseki Card",
  shapeCards: "Katachi",
  tetris: "Tetris",
  magnetic: "Magnetic",
  nPlusOne: "N+1",
  traitor: "Traitor",
  randomTurn: "Random Turn",
  teamGo: "Team Go",
};

export const VARIANT_KEYS = Object.keys(VARIANT_LABELS) as VariantKey[];

/**
 * Variant → variants it can't be combined with. Conflicts are symmetric; each pair is listed once,
 * under the variant named first in its error message.
 */
export const VARIANT_CONFLICTS: Partial<Record<VariantKey, readonly VariantKey[]>> = {
  josekiCard: ["tetris", "zen", "colorGo"],
  hiddenMove: ["zen"],
  zen: ["colorGo"],
  teamGo: ["zen"],
  shapeCards: [
    "pixel",
    "nPlusOne",
    "traitor",
    "tetris",
    "zen",
    "colorGo",
    "hiddenMove",
    "phantomMove",
  ],
  // Sliding would reveal hidden/phantom stones, and Pixel/Katachi place several stones at once.
  magnetic: ["pixel", "hiddenMove", "phantomMove", "shapeCards"],
  tetris: ["pixel"],
};

/** Every variant that can't be combined with `key`, in either direction of the table. */
export function conflictingVariants(key: VariantKey): VariantKey[] {
  const conflicts = new Set<VariantKey>(VARIANT_CONFLICTS[key] ?? []);
  for (const [other, blocked] of Object.entries(VARIANT_CONFLICTS)) {
    if (blocked?.includes(key)) conflicts.add(other as VariantKey);
  }
  return [...conflicts];
}

/** The parts of a game config that decide whether its variants fit together. */
export type VariantSelection = {
  variants: Partial<Record<string, unknown>>;
  boardSize: number;
  customGoban: boolean;
  ruleset?: string;
  handicap?: number;
};

/** Every reason the selection is invalid, in a stable order (empty when it's fine). */
export function variantConfigProblems(selection: VariantSelection): string[] {
  const on = (key: string) => Boolean(selection.variants[key]);
  const problems: string[] = [];
  // Rules that depend on other settings, not just on another variant.
  if (on("josekiCard") && selection.boardSize !== 19) {
    problems.push("Joseki Card requires a 19×19 board.");
  }
  if (on("josekiCard") && selection.customGoban) {
    problems.push("Joseki Card cannot be combined with Custom board.");
  }
  for (const [key, blocked] of Object.entries(VARIANT_CONFLICTS)) {
    if (!on(key)) continue;
    const chosen = (blocked ?? []).filter(on).map((other) => VARIANT_LABELS[other]);
    if (chosen.length) {
      problems.push(
        `${VARIANT_LABELS[key as VariantKey]} cannot be combined with ${chosen.join(", ")}.`,
      );
    }
  }
  if (on("shapeCards") && selection.ruleset === "chinese" && Number(selection.handicap ?? 0) > 1) {
    problems.push("Katachi cannot be combined with free handicap placement.");
  }
  if (on("tetris") && on("nPlusOne") && Number(selection.variants.nPlusOneCount) === 4) {
    problems.push("Tetris cannot be combined with N+1 count 4.");
  }
  return problems;
}
