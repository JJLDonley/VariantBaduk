import type { Color, Point } from "./types.ts";

export type Group = {
  color: Color;
  points: Point[];
  liberties: number;
};

export class Board {
  readonly width: number;
  readonly height: number;
  readonly points: number[];

  constructor(width: number, height: number, points?: number[]) {
    if (!Number.isInteger(width) || width < 1) throw new Error("invalid board width");
    if (!Number.isInteger(height) || height < 1) throw new Error("invalid board height");
    this.width = width;
    this.height = height;
    this.points = points ? [...points] : Array(width * height).fill(0);
    if (this.points.length !== width * height) throw new Error("invalid board points");
  }

  static from(width: number, height: number, points: number[]): Board {
    return new Board(width, height, points);
  }

  clone(): Board {
    return new Board(this.width, this.height, this.points);
  }

  within(point: Point): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < this.width && point.y < this.height;
  }

  playable(point: Point): boolean {
    return this.within(point) && this.points[this.index(point)] !== -1;
  }

  get(point: Point): Color {
    this.assertWithin(point);
    return this.points[this.index(point)];
  }

  set(point: Point, color: Color): void {
    this.assertPlayable(point);
    this.points[this.index(point)] = color;
  }

  neighbors(point: Point): Point[] {
    return [
      { x: point.x - 1, y: point.y },
      { x: point.x + 1, y: point.y },
      { x: point.x, y: point.y - 1 },
      { x: point.x, y: point.y + 1 },
    ].filter((candidate) => this.playable(candidate));
  }

  hash(): string {
    return `${this.width}x${this.height}:${this.points.join(",")}`;
  }

  equals(other: Board): boolean {
    return this.width === other.width && this.height === other.height &&
      this.points.every((point, index) => point === other.points[index]);
  }

  private index(point: Point): number {
    return point.y * this.width + point.x;
  }

  private assertWithin(point: Point): void {
    if (!this.within(point)) throw new Error("point out of bounds");
  }

  private assertPlayable(point: Point): void {
    if (!this.playable(point)) throw new Error("point out of bounds");
  }
}

export function findGroups(board: Board): Group[] {
  const visited = new Set<number>();
  const groups: Group[] = [];

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const start = { x, y };
      const color = board.get(start);
      const startIndex = y * board.width + x;
      if (color <= 0 || visited.has(startIndex)) continue;

      const points: Point[] = [];
      const liberties = new Set<number>();
      const stack = [start];
      visited.add(startIndex);

      while (stack.length > 0) {
        const point = stack.pop()!;
        points.push(point);

        for (const neighbor of board.neighbors(point)) {
          const neighborColor = board.get(neighbor);
          const neighborIndex = neighbor.y * board.width + neighbor.x;
          if (neighborColor === 0) {
            liberties.add(neighborIndex);
          } else if (neighborColor === color && !visited.has(neighborIndex)) {
            visited.add(neighborIndex);
            stack.push(neighbor);
          }
        }
      }

      groups.push({ color, points, liberties: liberties.size });
    }
  }

  return groups;
}
