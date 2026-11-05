/**
 * Custom board limits and geometry shared by the board editor, the server's config validation and
 * the data migration tool. Lives under client/ so the client bundle (and the public repo) has it.
 */

export const CUSTOM_BOARD_MIN_SIZE = 2;
/**
 * Technical cap that protects the server (memory and per-move work grow with the point count);
 * set well above anything playable, so in practice any size can be drawn.
 */
export const CUSTOM_BOARD_MAX_SIZE = 52;
/** Above this, stones get too small to play comfortably on phones. */
export const CUSTOM_BOARD_PHONE_FRIENDLY_SIZE = 19;

/** A board point is playable unless it is removed (-1). */
export function playablePointCount(points: readonly number[]): number {
  return points.filter((point) => point !== -1).length;
}

/**
 * Separate groups of playable points ("islands"), connected along the grid lines (not
 * diagonally), the same adjacency the rules use.
 */
export function islandCount(width: number, height: number, points: readonly number[]): number {
  const seen = new Uint8Array(width * height);
  let islands = 0;
  for (let start = 0; start < points.length; start++) {
    if (points[start] === -1 || seen[start]) continue;
    islands++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || points[next] === -1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return islands;
}

/** Whether a board is larger than what plays comfortably on a phone. */
export function exceedsPhoneFriendlySize(width: number, height: number): boolean {
  return Math.max(width, height) > CUSTOM_BOARD_PHONE_FRIENDLY_SIZE;
}
