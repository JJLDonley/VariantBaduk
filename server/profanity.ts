const BAD_WORDS_DIRECTORY = new URL("../data/bad-words/", import.meta.url);
let cachedBadWords: string[] | undefined;

export function sanitizePublicName(value: unknown, fallback = "Player", maxLength = 16): string {
  const name = String(value ?? "").replace(/[<>"'`\\]/g, "").trim().replace(/\s+/g, " ").slice(
    0,
    maxLength,
  );
  if (!name) return fallback;
  return hasBadWord(name) ? fallback : name;
}

export function hasBadWord(value: string): boolean {
  const normalized = normalizeForFilter(value);
  if (!normalized) return false;
  return badWords().some((word) => normalized.includes(word));
}

function badWords(): string[] {
  if (cachedBadWords) return cachedBadWords;
  const words = new Set<string>();
  try {
    for (const entry of Deno.readDirSync(BAD_WORDS_DIRECTORY)) {
      if (!entry.isFile || !entry.name.endsWith(".txt")) continue;
      const text = Deno.readTextFileSync(new URL(entry.name, BAD_WORDS_DIRECTORY));
      for (const line of text.split(/\r?\n/)) {
        const word = normalizeForFilter(line);
        if (word.length >= 3) words.add(word);
      }
    }
  } catch {
    // Keep filtering best-effort if the optional word-list directory is unavailable.
  }
  cachedBadWords = [...words].sort((a, b) => b.length - a.length);
  return cachedBadWords;
}

function normalizeForFilter(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}\s_]+/gu, " ").trim();
}
