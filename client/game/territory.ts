import { type BoardFrame, neighborIndexes, pointPosition } from "./board-utils.ts";
import { stoneColor } from "./display.ts";
import type { Game } from "../types/domain.ts";

export function territoryShadeHtml(
  game: Game,
  boardColors: number[],
  frame?: BoardFrame,
): string {
  if (game.phase !== "scoring" && game.phase !== "done") return "";
  return territoryShadeIndexes(game, boardColors).map(({ index, team }) => {
    const point = pointPosition(game, index, frame);
    return `<i class="territory-shade" aria-hidden="true" style="left: ${point.left}%; top: ${point.top}%; --territory-color: ${
      stoneColor(game, team)
    }"></i>`;
  }).join("");
}

function territoryShadeIndexes(
  game: Game,
  boardColors: number[],
): Array<{ index: number; team: number }> {
  const width = game.boardWidth;
  const height = game.boardHeight;
  const dead = game.deadStones ?? [];
  const visited = new Set<number>();
  const shaded: Array<{ index: number; team: number }> = [];
  const noScore = game.noScorePoints ?? [];
  const isTerritoryPoint = (index: number) =>
    (boardColors[index] === 0 || dead[index]) && !noScore[index];
  const isLiveStone = (index: number) => boardColors[index] > 0 && !dead[index];
  for (let index = 0; index < boardColors.length; index++) {
    if (visited.has(index) || !isTerritoryPoint(index)) continue;
    const region: number[] = [];
    const borderingTeams = new Set<number>();
    const stack = [index];
    visited.add(index);
    while (stack.length > 0) {
      const current = stack.pop()!;
      region.push(current);
      for (const neighbor of neighborIndexes(current, width, height)) {
        if (boardColors[neighbor] === -1) continue;
        if (isLiveStone(neighbor)) borderingTeams.add(boardColors[neighbor]);
        else if (isTerritoryPoint(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (borderingTeams.size !== 1) continue;
    const [team] = borderingTeams;
    for (const pointIndex of region) shaded.push({ index: pointIndex, team });
  }
  return shaded;
}
