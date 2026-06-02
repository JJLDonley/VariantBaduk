import type { CreateGameConfig } from "../types/domain.ts";
import { parseCustomGoban } from "./custom-goban.ts";

export function gameConfigFromFormData(data: FormData): CreateGameConfig {
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
        String(data.get("colorGoColor3") ?? "#6c8cff"),
        String(data.get("colorGoColor4") ?? "#e07a5f"),
      ],
      colorGoKomi: [
        0,
        Number(data.get("colorGoKomi2")),
        Number(data.get("colorGoKomi3")),
        Number(data.get("colorGoKomi4")),
      ],
      phantomMove: data.has("phantomMove"),
      phantomHideViewers: data.has("phantomHideViewers"),
      hiddenMove: data.has("hiddenMove"),
      hiddenMoveCount: Number(data.get("hiddenMoveCount")),
      hiddenMoveShowViewers: data.has("hiddenMoveShowViewers"),
      josekiCard: data.has("josekiCard"),
      tetris: data.has("tetris"),
      nPlusOne: data.has("nPlusOne"),
      nPlusOneCount: Number(data.get("nPlusOneCount")),
      traitor: data.has("traitor"),
      traitorStoneCount: Number(data.get("traitorMoveCount")),
      showTraitorCounter: data.has("showTraitorCounter"),
    },
  };
}
