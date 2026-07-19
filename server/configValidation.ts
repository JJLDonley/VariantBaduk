import type { GameConfig, TimeConfig } from "./gameStore.ts";
import { sanitizePublicName } from "./profanity.ts";

export type GameConfigInput = Record<string, unknown>;

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: 9,
  ruleset: "chinese",
  komi: 7.5,
  handicap: 0,
  time: {
    system: "none",
    main: 0,
    periods: 0,
    periodTime: 0,
    fischerIncrement: 0,
  },
  creatorSeat: "black",
  variants: {
    capturesGivePoints: false,
    ponnukiPointValue: 0,
    pixel: false,
    zen: false,
    zenPlayerCount: 3,
    colorGo: false,
    colorGoPlayerCount: 3,
    colorGoColors: ["#111111", "#eeeeee", "#4f9d69", "#e07a5f"],
    colorGoKomi: [0, 3.5, 5.5, 7.5],
    phantomMove: false,
    phantomHideViewers: false,
    hiddenMove: false,
    hiddenMoveCount: 3,
    hiddenMoveShowViewers: true,
    josekiCard: false,
    tetris: false,
    nPlusOne: false,
    nPlusOneCount: 1,
    traitor: false,
    traitorMode: "moves",
    traitorStoneCount: 6,
    traitorChance: 10,
    showTraitorCounter: false,
    randomTurn: false,
    teamGo: false,
    teamGoSeatCounts: [2, 2],
  },
};

export function normalizeConfig(config: Partial<GameConfig>): GameConfig {
  const boardSize = Number(config.boardSize ?? DEFAULT_CONFIG.boardSize);
  const ruleset = normalizeRuleset(config.ruleset);
  const customGoban = normalizeCustomGoban(config.customGoban, boardSize);
  const normalized: GameConfig = {
    boardSize: [9, 13, 19].includes(boardSize) ? boardSize : DEFAULT_CONFIG.boardSize,
    ...(config.name !== undefined && sanitizePublicName(config.name, "", 32)
      ? { name: sanitizePublicName(config.name, "", 32) }
      : {}),
    ...(customGoban ? { customGoban } : {}),
    ruleset,
    ...(config.creatorSeat !== undefined
      ? { creatorSeat: normalizeCreatorSeat(config.creatorSeat) }
      : {}),
    variants: {
      capturesGivePoints: Boolean(config.variants?.capturesGivePoints),
      nPlusOne: Boolean(config.variants?.nPlusOne),
      traitor: Boolean(config.variants?.traitor),
      randomTurn: Boolean(config.variants?.randomTurn),
      teamGo: Boolean(config.variants?.teamGo),
    },
  };

  if (config.handicap !== undefined) normalized.handicap = boundedInteger(config.handicap, 0, 9);
  if (config.komi !== undefined || !["area", "territory"].includes(ruleset)) {
    normalized.komi = finiteNumber(config.komi, defaultKomi(ruleset, normalized.handicap ?? 0));
  }
  if (config.time && normalizeTimeSystem(config.time.system) !== "none") {
    normalized.time = {
      system: normalizeTimeSystem(config.time.system),
      main: nonNegativeNumber(config.time.main) * 60,
      periods: boundedInteger(config.time.periods, 0, 100),
      periodTime: nonNegativeNumber(config.time.periodTime),
      fischerIncrement: nonNegativeNumber(config.time.fischerIncrement),
    };
  }
  if (config.variants?.ponnukiPointValue) {
    normalized.variants.ponnukiPointValue = nonNegativeNumber(config.variants.ponnukiPointValue);
  }
  if (config.variants?.pixel) normalized.variants.pixel = true;
  if (config.variants?.zen) {
    normalized.variants.zen = true;
    normalized.variants.zenPlayerCount = oddPlayerCount(config.variants?.zenPlayerCount);
  }
  if (config.variants?.colorGo) {
    normalized.variants.colorGo = true;
    normalized.variants.colorGoPlayerCount = boundedInteger(
      config.variants?.colorGoPlayerCount,
      2,
      4,
    );
    normalized.variants.colorGoColors = normalizeColors(
      config.variants?.colorGoColors,
      normalized.variants.colorGoPlayerCount,
    );
    normalized.variants.colorGoKomi = normalizeColorGoKomi(
      config.variants?.colorGoKomi,
      normalized.variants.colorGoPlayerCount,
    );
  }
  if (config.variants?.teamGo) {
    normalized.variants.teamGo = true;
    normalized.variants.teamGoSeatCounts = normalizeTeamGoSeatCounts(
      config.variants?.teamGoSeatCounts,
      normalized.variants.colorGo ? normalized.variants.colorGoPlayerCount ?? 2 : 2,
    );
  }
  if (config.variants?.hiddenMove) {
    normalized.variants.hiddenMove = true;
    normalized.variants.hiddenMoveCount = boundedInteger(config.variants?.hiddenMoveCount, 1, 20);
    if (config.variants?.hiddenMoveShowViewers !== false) {
      normalized.variants.hiddenMoveShowViewers = true;
    }
  }
  if (config.variants?.phantomMove) {
    normalized.variants.phantomMove = true;
    if (config.variants?.phantomHideViewers) normalized.variants.phantomHideViewers = true;
  }
  if (config.variants?.josekiCard) normalized.variants.josekiCard = true;
  if (config.variants?.tetris) normalized.variants.tetris = true;
  if (config.variants?.nPlusOne || config.variants?.nPlusOneCount !== undefined) {
    normalized.variants.nPlusOneCount = positiveNumber(config.variants?.nPlusOneCount);
  }
  if (
    config.variants?.traitor || config.variants?.traitorMode !== undefined ||
    config.variants?.traitorStoneCount !== undefined || config.variants?.traitorChance !== undefined
  ) {
    normalized.variants.traitorMode = normalizeTraitorMode(config.variants?.traitorMode);
    normalized.variants.traitorStoneCount = positiveNumber(config.variants?.traitorStoneCount ?? 6);
    normalized.variants.traitorChance = boundedInteger(
      config.variants?.traitorChance ?? 10,
      1,
      100,
    );
    if (config.variants?.showTraitorCounter) normalized.variants.showTraitorCounter = true;
  }

  return normalized;
}

export function validateGameConfig(config: GameConfigInput): string[] {
  const messages: string[] = [];
  const variants = objectValue(config.variants);
  if (variants?.josekiCard && Number(config.boardSize ?? DEFAULT_CONFIG.boardSize) !== 19) {
    messages.push("Joseki Card requires a 19×19 board.");
  }
  if (
    variants?.josekiCard &&
    (variants.zen || variants.colorGo || variants.tetris || config.customGoban)
  ) {
    messages.push("Joseki Card cannot be combined with Custom board, Tetris, Zen, or Color Go.");
  }
  if (variants?.hiddenMove && variants.zen) {
    messages.push("Hidden cannot be combined with Zen.");
  }
  if (variants?.zen && variants.colorGo) {
    messages.push("Zen cannot be combined with Color Go.");
  }
  if (variants?.teamGo && variants.zen) {
    messages.push("Team Go cannot be combined with Zen.");
  }
  if (variants?.tetris) {
    if (variants.pixel) messages.push("Tetris cannot be combined with Pixel.");
    if (variants.nPlusOne && Number(variants.nPlusOneCount) === 4) {
      messages.push("Tetris cannot be combined with N+1 count 4.");
    }
  }
  return messages;
}

export function invalidVariantComboMessage(config: GameConfigInput): string {
  return validateGameConfig(config)[0] ?? "";
}

function normalizeCustomGoban(
  custom: Partial<GameConfig["customGoban"]> | undefined,
  boardSize: number,
): GameConfig["customGoban"] | undefined {
  if (!custom) return undefined;
  const width = boundedInteger(custom.width, 2, 25);
  const height = boundedInteger(custom.height, 2, 25);
  const points = Array.isArray(custom.points) ? custom.points.slice(0, width * height) : [];
  if (points.length !== width * height) return undefined;
  const normalized = points.map((point) => point === -1 ? -1 : 0);
  if (normalized.every((point) => point === -1)) return undefined;
  const embeddedStarPoints = points.flatMap((point, index) =>
    point === 1 ? [{ x: index % width, y: Math.floor(index / width) }] : []
  );
  const explicitStarPoints = Array.isArray(custom.starPoints)
    ? custom.starPoints.filter((point) =>
      Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 &&
      point.x < width && point.y < height && normalized[point.y * width + point.x] !== -1
    ).map((point) => ({ x: point.x, y: point.y }))
    : [];
  const starPoints = uniquePoints([...explicitStarPoints, ...embeddedStarPoints]);
  return { width, height, points: normalized, ...(starPoints.length ? { starPoints } : {}) };
}

function uniquePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRuleset(ruleset: unknown): GameConfig["ruleset"] {
  return ["area", "territory", "chinese", "aga", "japanese"].includes(String(ruleset))
    ? ruleset as GameConfig["ruleset"]
    : DEFAULT_CONFIG.ruleset;
}

function defaultKomi(ruleset: GameConfig["ruleset"], handicap = 0): number {
  if (handicap > 0) return 0.5;
  return ruleset === "chinese" || ruleset === "aga" ? 7.5 : 6.5;
}

function normalizeTimeSystem(system: unknown): TimeConfig["system"] {
  return ["none", "byoyomi", "fischer"].includes(String(system))
    ? system as TimeConfig["system"]
    : DEFAULT_CONFIG.time?.system ?? "none";
}

function normalizeTraitorMode(mode: unknown): "moves" | "percentage" {
  return mode === "percentage" ? "percentage" : "moves";
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value: unknown): number {
  const number = finiteNumber(value, 0);
  return number >= 0 ? number : 0;
}

function positiveNumber(value: unknown): number {
  const number = finiteNumber(value, 1);
  return number >= 1 ? number : 1;
}

function oddPlayerCount(value: unknown): number {
  const count = boundedInteger(value, 3, 9);
  return count % 2 === 1 ? count : count + 1 <= 9 ? count + 1 : count - 1;
}

function normalizeCreatorSeat(value: unknown): string {
  if (value === "black" || value === "white" || value === "none") return value;
  if (typeof value === "string" && /^player-\d+$/.test(value)) return value;
  if (typeof value === "string" && /^team-\d+-\d+$/.test(value)) return value;
  return DEFAULT_CONFIG.creatorSeat ?? "black";
}

function normalizeColors(colors: unknown, count: number): string[] {
  const defaults = DEFAULT_CONFIG.variants.colorGoColors ?? [];
  return Array.from({ length: count }, (_, index) => {
    const color = Array.isArray(colors) ? colors[index] : undefined;
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : defaults[index] ?? "#777777";
  });
}

function normalizeTeamGoSeatCounts(counts: unknown, teamCount: number): number[] {
  const defaults = DEFAULT_CONFIG.variants.teamGoSeatCounts ?? [2, 2];
  const values = Array.isArray(counts) ? counts : defaults;
  const normalized = Array.from(
    { length: teamCount },
    (_, index) => boundedInteger(values[index] ?? defaults[index] ?? 0, 0, 9),
  );
  if (normalized.filter((count) => count > 0).length < 2) return [2, 2];
  return normalized;
}

function normalizeColorGoKomi(komi: unknown, count: number): number[] {
  const defaults = defaultColorGoKomi(count);
  return Array.from({ length: count }, (_, index) =>
    finiteNumber(
      Array.isArray(komi) ? komi[index] : undefined,
      defaults[index] ?? 0,
    ));
}

function defaultColorGoKomi(count: number): number[] {
  if (count >= 4) return [0, 3.5, 5.5, 7.5];
  if (count === 3) return [0, 5.5, 7.5];
  return [0, 7.5];
}

function boundedInteger(value: unknown, min: number, max: number): number {
  const number = Math.trunc(finiteNumber(value, min));
  return Math.min(max, Math.max(min, number));
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
