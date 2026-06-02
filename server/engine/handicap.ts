import { Board } from "./board.ts";
import type { Point, SharedState } from "./types.ts";

export function applyHandicap(state: SharedState, board: Board, handicap: number): void {
  const stones = handicapPoints(board.width, board.height, handicap);
  if (stones.length === 0) return;
  for (const point of stones) if (board.playable(point)) board.set(point, 1);
  state.board = board.points;
  state.play.lastStone = stones;
  state.play.movesPlayed = stones.length;
  const whiteTurn = state.seats.findIndex((seat) => !seat.resigned && seat.team !== 1);
  if (whiteTurn >= 0) state.turn = whiteTurn;
}

function handicapPoints(width: number, height: number, handicap: number): Point[] {
  const count = Math.trunc(handicap);
  if (count < 2 || width !== height || ![9, 13, 19].includes(width)) return [];
  const star = width === 9 ? 2 : 3;
  const low = width - 1 - star;
  const mid = Math.floor(width / 2);
  const pointsByCount: Record<number, Point[]> = {
    2: [{ x: star, y: star }, { x: star, y: low }],
    3: [{ x: star, y: star }, { x: star, y: low }, { x: low, y: star }],
    4: [{ x: star, y: star }, { x: star, y: low }, { x: low, y: star }, { x: low, y: low }],
    5: [{ x: star, y: star }, { x: star, y: low }, { x: low, y: star }, { x: low, y: low }, {
      x: mid,
      y: mid,
    }],
    6: [{ x: star, y: star }, { x: star, y: mid }, { x: star, y: low }, { x: low, y: star }, {
      x: mid,
      y: star,
    }, { x: low, y: low }],
    7: [
      { x: star, y: star },
      { x: star, y: mid },
      { x: star, y: low },
      { x: low, y: star },
      { x: low, y: mid },
      { x: low, y: low },
      { x: mid, y: mid },
    ],
    8: [
      { x: star, y: star },
      { x: star, y: mid },
      { x: star, y: low },
      { x: low, y: star },
      { x: mid, y: star },
      { x: low, y: mid },
      { x: mid, y: low },
      { x: low, y: low },
    ],
    9: [
      { x: star, y: star },
      { x: star, y: mid },
      { x: star, y: low },
      { x: low, y: star },
      { x: mid, y: star },
      { x: low, y: mid },
      { x: mid, y: low },
      { x: low, y: low },
      { x: mid, y: mid },
    ],
  };
  return pointsByCount[Math.min(9, count)] ?? [];
}
