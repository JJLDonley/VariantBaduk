import type { Game } from "../types/domain.ts";

type VariantRule = { label: string; rule: string; html?: string };

const ALL_VARIANT_RULES: VariantRule[] = [
  { label: "CGoban", rule: "Custom board shapes can remove points from the goban." },
  { label: "Captures are points", rule: "Captures add points immediately." },
  { label: "Ponnuki points", rule: "Single-stone captures can award extra points." },
  { label: "Pixel", rule: "Each move places a 2×2 block where possible." },
  { label: "Zen", rule: "Multi-player game where placed stone color alternates by move." },
  { label: "Color Go", rule: "Multi-player Go: each player has their own stone color and komi." },
  {
    label: "Phantom",
    rule: "Stones start hidden; collisions, captures, atari, and scoring reveal them.",
  },
  {
    label: "Joseki Card",
    rule: "Players select and place joseki cards in corners before normal play begins.",
  },
  {
    label: "Hidden",
    rule:
      "Players secretly pre-place stones before normal play begins; unique hidden stones remain hidden until revealed.",
  },

  {
    label: "Tetris",
    rule: "A move is illegal only if it creates a connected group of exactly 4 stones.",
  },
  { label: "N+1", rule: "Making exactly N stones in a row grants an extra turn." },
  {
    label: "Traitor",
    rule: "Some stones may play as another color instead of the player's normal color.",
  },
];

export function variantsHtml(game: Game): string {
  const rules = activeVariantRules(game);
  return rules.map(({ label, rule, html }) =>
    html ?? `<span title="${escapeAttr(rule)}">${label}</span>`
  ).join(", ") || "None";
}

export function inviteRulesHtml(game: Game): string {
  const rules = activeVariantRules(game);
  if (rules.length === 0) return `<p class="muted-text">No active variants.</p>`;
  return `<ul>${
    rules.map(({ label, rule }) => `<li><strong>${label}:</strong> ${rule}</li>`).join("")
  }</ul>`;
}

export function variantRulesHelpHtml(game: Game): string {
  return `
    <div class="variant-rules-help">
      <h4>Variant rules</h4>
      ${inviteRulesHtml(game)}
    </div>
  `;
}

export function allVariantRulesHelpHtml(): string {
  return `
    <div class="variant-rules-help">
      <h3>Help</h3>
      <p>Create or join a game. In a game, this help button shows rules for active variants.</p>
      <h4>Variant rules</h4>
      ${
    ALL_VARIANT_RULES.map(({ label, rule }) =>
      `<details><summary>${label}</summary><p>${rule}</p></details>`
    ).join("")
  }
      <h4>Privacy, licensing, and acknowledgements</h4>
      <details>
        <summary>Privacy</summary>
        <p>We do not use analytics, ads, or behavioral tracking. We store only enough session/game data to connect players to games and seats.</p>
      </details>
      <details>
        <summary>Licensing and acknowledgements</summary>
        <p>Variant Go Server is released under the MIT License.</p>
        <p>Inspired by JaniM.</p>
        <p>Profanity word lists are vendored from <a href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">LDNOOBW's bad-word lists</a>.</p>
      </details>
    </div>
  `;
}

function activeVariantRules(game: Game): VariantRule[] {
  const variants = game.config.variants ?? {};
  const rules: VariantRule[] = [];
  if (game.config.customGoban) {
    const rule = "This game uses a custom board shape.";
    rules.push({
      label: "CGoban",
      rule,
      html: `<button class="variant-button variant-meta-button" data-cgoban-preview title="${
        escapeAttr(rule)
      }" type="button">CGoban</button>`,
    });
  }
  if (variants.capturesGivePoints) {
    rules.push({ label: "Captures are points", rule: "Captures add points immediately." });
  }
  if (variants.ponnukiPointValue) {
    rules.push({
      label: `Ponnukis are ${variants.ponnukiPointValue} points`,
      rule: `Single-stone captures are worth ${variants.ponnukiPointValue} extra points.`,
    });
  }
  if (variants.pixel) {
    rules.push({ label: "Pixel", rule: "Each move places a 2×2 block where possible." });
  }
  if (variants.zen) {
    rules.push({
      label: `Zen (${variants.zenPlayerCount ?? 3} players)`,
      rule: `${variants.zenPlayerCount ?? 3} players; placed stone color alternates by move.`,
    });
  }
  if (variants.colorGo) {
    rules.push({
      label: `Color (${variants.colorGoPlayerCount ?? 3} players)`,
      rule: `${variants.colorGoPlayerCount ?? 3} players, each with their own color and komi.`,
    });
  }
  if (variants.phantomMove) {
    rules.push({
      label: `Phantom${variants.phantomHideViewers ? " (viewers hidden)" : ""}`,
      rule: `Stones start hidden; collisions, captures, atari, and scoring reveal them${
        variants.phantomHideViewers ? "; viewers cannot see hidden stones" : ""
      }.`,
    });
  }
  if (variants.hiddenMove) {
    rules.push({
      label: "Hidden",
      rule: `${
        variants.hiddenMoveCount ?? 3
      } hidden stones per player before play starts; unique hidden stones remain hidden until revealed.`,
    });
  }
  if (variants.josekiCard) {
    rules.push({
      label: "Joseki Card",
      rule: "Players select and place joseki cards in corners before normal play begins.",
    });
  }
  if (variants.tetris) {
    rules.push({
      label: "Tetris",
      rule: "A move is illegal only if it creates a connected group of exactly 4 stones.",
    });
  }
  if (variants.nPlusOne) {
    rules.push({
      label: `N+1 extra turn (${variants.nPlusOneCount ?? 1})`,
      rule: `Making exactly ${variants.nPlusOneCount ?? 1} in a row grants an extra turn.`,
    });
  }
  if (variants.traitor) {
    rules.push({
      label: `Traitor moves (${variants.traitorStoneCount ?? 6})`,
      rule: `Some stones may play as another color (${
        variants.traitorStoneCount ?? 6
      } traitor moves).`,
    });
  }
  return rules;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
