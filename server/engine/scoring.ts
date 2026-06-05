import { Board } from "./board.ts";
import type { RuleMods, SharedState } from "./types.ts";

export type Territory = {
  points: { x: number; y: number }[];
  borderingTeams: Set<number>;
};

export function scoringAreaPoints(
  state: SharedState,
  board: Board,
  point: { x: number; y: number },
): { x: number; y: number }[] {
  const startIndex = pointIndex(state, point);
  const isAreaPoint = (candidate: { x: number; y: number }) => {
    const index = pointIndex(state, candidate);
    return board.get(candidate) === 0 || Boolean(state.play.deadStones?.[index]);
  };
  if (!isAreaPoint(point)) return [];
  const visited = new Set<number>([startIndex]);
  const area: { x: number; y: number }[] = [];
  const stack = [point];
  while (stack.length > 0) {
    const current = stack.pop()!;
    area.push(current);
    for (const neighbor of board.neighbors(current)) {
      const index = pointIndex(state, neighbor);
      if (visited.has(index) || !isAreaPoint(neighbor)) continue;
      visited.add(index);
      stack.push(neighbor);
    }
  }
  return area;
}

export function winnerTeams(points: number[]): number[] {
  const highScore = Math.max(...points);
  return points.flatMap((score, index) => score === highScore ? [index + 1] : []);
}

export function scoreBoard(state: SharedState, board: Board, mods: RuleMods): number[] {
  // Score virtually: dead stones remain visible in the UI, but are removed before counting.
  const scoringBoard = withoutDeadStones(state, board);
  const teamCount = Math.max(...state.seats.map((seat) => seat.team));
  const scores = Array.from(
    { length: mods.zen ? Math.max(2, teamCount) : teamCount },
    (_, index) => mods.scoring === "territory" ? state.play.capturedStones[index] ?? 0 : 0,
  );
  if (mods.scoring === "territory") {
    for (let index = 0; index < teamCount; index++) {
      scores[index] += state.play.capturedStones[index] ?? 0;
    }
  }

  for (let y = 0; y < scoringBoard.height; y++) {
    for (let x = 0; x < scoringBoard.width; x++) {
      const color = scoringBoard.get({ x, y });
      if (color === -1) continue;
      if (color > 0 && mods.scoring !== "territory") scores[color - 1] += 1;
    }
  }

  for (const territory of findTerritories(scoringBoard)) {
    if (territory.borderingTeams.size !== 1) continue;
    const [team] = territory.borderingTeams;
    const scoringPoints = territory.points.filter((point) => {
      const index = pointIndex(state, point);
      return !state.play.noScorePoints?.[index];
    });
    scores[team - 1] += scoringPoints.length;
    if (mods.scoring === "territory") {
      scores[team - 1] += scoringPoints.filter((point) =>
        state.play.deadStones?.[pointIndex(state, point)]
      ).length;
    }
  }

  if (mods.colorGo && mods.colorGoKomi) {
    for (let index = 0; index < scores.length; index++) {
      scores[index] += mods.colorGoKomi[index] ?? 0;
    }
  } else if (scores.length >= 2) scores[1] += mods.komi ?? 0;
  return scores;
}

export function findTerritories(board: Board): Territory[] {
  const visited = new Set<number>();
  const territories: Territory[] = [];

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const start = { x, y };
      const startIndex = y * board.width + x;
      if (visited.has(startIndex) || board.get(start) !== 0) continue;

      const points = [];
      const borderingTeams = new Set<number>();
      const stack = [start];
      visited.add(startIndex);

      while (stack.length > 0) {
        const point = stack.pop()!;
        points.push(point);

        for (const neighbor of board.neighbors(point)) {
          const color = board.get(neighbor);
          const neighborIndex = neighbor.y * board.width + neighbor.x;
          if (color > 0) borderingTeams.add(color);
          else if (!visited.has(neighborIndex)) {
            visited.add(neighborIndex);
            stack.push(neighbor);
          }
        }
      }

      territories.push({ points, borderingTeams });
    }
  }

  return territories;
}

function withoutDeadStones(state: SharedState, board: Board): Board {
  const next = board.clone();
  for (let index = 0; index < next.points.length; index++) {
    if (state.play.deadStones?.[index] && next.points[index] > 0) next.points[index] = 0;
  }
  return next;
}

function pointIndex(state: SharedState, point: { x: number; y: number }): number {
  return point.y * state.boardWidth + point.x;
}
