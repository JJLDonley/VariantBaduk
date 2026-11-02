import type { CreateGameConfig } from "../types/domain.ts";
import { parseCustomGoban } from "./custom-goban.ts";

export function gameConfigFromFormData(data: FormData): CreateGameConfig {
  const viewersSeeInvisible = data.has("invisibleStonesShowViewers") ||
    data.has("hiddenMoveShowViewers");
  return {
    boardSize: Number(data.get("boardSize")),
    name: String(data.get("gameName") ?? "").trim(),
    ruleset: String(data.get("ruleset") ?? "chinese"),
    komi: Number(data.get("komi")),
    handicap: Number(data.get("handicap")),
    creatorSeat: String(data.get("creatorSeat") ?? "black"),
    time: {
      system: String(data.get("timeSystem") ?? "none"),
      main: Number(data.get("mainTime")),
      periods: Number(data.get("periods")),
      periodTime: Number(data.get("periodTime")),
      fischerIncrement: Number(data.get("fischerIncrement")),
    },
    customGoban: data.has("customGobanMode")
      ? parseCustomGoban(data.get("customGoban"), Number(data.get("boardSize")))
      : undefined,
    variants: {
      capturesGivePoints: data.has("capturesGivePoints"),
      ponnukiPointValue: Number(data.get("ponnukiPointValue")),
      pixel: data.has("pixel"),
      zen: data.has("zen"),
      zenPlayerCount: Number(data.get("zenPlayerCount")),
      colorGo: data.has("colorGo"),
      colorGoPlayerCount: Number(data.get("colorGoPlayerCount")),
      colorGoColors: [
        String(data.get("colorGoColor1") ?? "#111111"),
        String(data.get("colorGoColor2") ?? "#eeeeee"),
        String(data.get("colorGoColor3") ?? "#4f9d69"),
        String(data.get("colorGoColor4") ?? "#e07a5f"),
      ],
      colorGoKomi: [
        0,
        Number(data.get("colorGoKomi2")),
        Number(data.get("colorGoKomi3")),
        Number(data.get("colorGoKomi4")),
      ],
      phantomMove: data.has("phantomMove"),
      phantomHideViewers: data.has("phantomHideViewers") ||
        (data.has("phantomMove") && !viewersSeeInvisible),
      hiddenMove: data.has("hiddenMove"),
      hiddenMoveCount: Number(data.get("hiddenMoveCount")),
      hiddenMoveShowViewers: viewersSeeInvisible,
      josekiCard: data.has("josekiCard"),
      shapeCards: data.has("shapeCards"),
      shapeCardHandSize: Number(data.get("shapeCardHandSize") ?? 4),
      shapeCardFull: data.has("shapeCardFull"),
      shapeCardReshuffle: data.has("shapeCardReshuffle"),
      tetris: data.has("tetris"),
      nPlusOne: data.has("nPlusOne"),
      nPlusOneCount: Number(data.get("nPlusOneCount")),
      traitor: data.has("traitor"),
      traitorMode: data.get("traitorMode") === "percentage" ? "percentage" : "moves",
      traitorStoneCount: Number(data.get("traitorMoveCount") ?? 6),
      traitorChance: Number(data.get("traitorChancePercent") ?? 10),
      randomTurn: data.has("randomTurn"),
      teamGo: data.has("teamGo"),
      teamGoSeatCounts: [
        Number(data.get("teamGoSeats1")),
        Number(data.get("teamGoSeats2")),
        Number(data.get("teamGoSeats3")),
        Number(data.get("teamGoSeats4")),
      ],
    },
  };
}
