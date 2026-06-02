import type { JosekiCard, JosekiStone } from "./engine/variants/josekiCard.ts";

const DEFAULT_JOSEKI_CARD_DIR = new URL("../data/joseki/", import.meta.url);
let cachedCards: JosekiCard[] | undefined;

export async function listJosekiCards(
  directory: URL = DEFAULT_JOSEKI_CARD_DIR,
): Promise<JosekiCard[]> {
  if (directory.href === DEFAULT_JOSEKI_CARD_DIR.href && cachedCards) return cachedCards;
  const cards: JosekiCard[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile || !entry.name.endsWith(".card")) continue;
      const text = await Deno.readTextFile(new URL(entry.name, directory));
      cards.push(parseJosekiCardData(text));
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  if (directory.href === DEFAULT_JOSEKI_CARD_DIR.href) cachedCards = cards;
  return cards;
}

export function listJosekiCardsSync(directory: URL = DEFAULT_JOSEKI_CARD_DIR): JosekiCard[] {
  if (directory.href === DEFAULT_JOSEKI_CARD_DIR.href && cachedCards) return cachedCards;
  const cards: JosekiCard[] = [];
  try {
    for (const entry of Deno.readDirSync(directory)) {
      if (!entry.isFile || !entry.name.endsWith(".card")) continue;
      const text = Deno.readTextFileSync(new URL(entry.name, directory));
      cards.push(parseJosekiCardData(text));
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  if (directory.href === DEFAULT_JOSEKI_CARD_DIR.href) cachedCards = cards;
  return cards;
}

export async function getJosekiCard(
  id: string,
  directory: URL = DEFAULT_JOSEKI_CARD_DIR,
): Promise<JosekiCard | undefined> {
  const cards = await listJosekiCards(directory);
  return cards.find((card) => card.id === id);
}

export function parseJosekiCardData(text: string): JosekiCard {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return parseJosekiCard(JSON.parse(trimmed));
  return parseJosekiCardText(trimmed);
}

function parseJosekiCardText(text: string): JosekiCard {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fields = new Map<string, string>();
  const stonesIndex = lines.findIndex((line) => /^STONES=$/i.test(line));
  if (stonesIndex < 0) throw new Error("invalid joseki card text");
  for (const line of lines.slice(0, stonesIndex)) {
    const match = line.match(/^([A-Z]+)=(.*)$/i);
    if (match) fields.set(match[1].toUpperCase(), match[2].trim());
  }
  const id = fields.get("ID") ?? "";
  const name = fields.get("NAME") ?? id;
  const boardSize = numberValue(fields.get("SIZE"), 19);
  const stones = lines.slice(stonesIndex + 1).map(parseJosekiStoneText);
  if (!id || stones.length === 0) throw new Error("invalid joseki card text");
  return { id, name, boardSize, stones };
}

function parseJosekiStoneText(line: string): JosekiStone {
  const match = line.match(/^([BW])\[([a-z]{2})\];?$/i);
  if (!match) throw new Error("invalid joseki stone text");
  return {
    ...cardPoint(match[2]),
    color: match[1].toUpperCase() === "B" ? 1 : 2,
  };
}

function cardPoint(value: string): { x: number; y: number } {
  const letters = value === value.toUpperCase() ? value : value.toLowerCase();
  const offset = value === value.toUpperCase() ? 65 : 97;
  return { x: letters.charCodeAt(0) - offset, y: letters.charCodeAt(1) - offset };
}

function parseJosekiCard(value: unknown): JosekiCard {
  if (!isRecord(value)) throw new Error("invalid joseki card");
  const id = stringValue(value.id, "");
  const name = stringValue(value.name, id);
  const boardSize = numberValue(value.boardSize, 19);
  const stones = Array.isArray(value.stones) ? value.stones.map(parseJosekiStone) : [];
  if (!id || stones.length === 0) throw new Error("invalid joseki card");
  return { id, name, boardSize, stones };
}

function parseJosekiStone(value: unknown): JosekiStone {
  if (!isRecord(value)) throw new Error("invalid joseki stone");
  return {
    x: numberValue(value.x, 0),
    y: numberValue(value.y, 0),
    color: numberValue(value.color, 0),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
