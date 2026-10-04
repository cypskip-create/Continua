/** Pure gesture arbitration: taps, horizontal drags and upward scrolls never claim refresh. */
export function pullDistance(dx: number, dy: number): number {
  if (dy <= 12 || dy <= Math.abs(dx) * 1.5) return 0;
  return Math.min(96, (dy - 12) * 0.45);
}
export const REFRESH_THRESHOLD = 64;
