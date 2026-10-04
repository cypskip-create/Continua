/** Separate overlapping bubbles into as many rows as necessary; never cycle
 * back into an occupied row. x and size are in the same (pixel) units. */
export function layoutMetricBubbles<T extends { x: number; size: number }>(points: T[]) {
  const ends: number[] = [];
  return [...points].sort((a, b) => a.x - b.x).map((point) => {
    const left = point.x - point.size / 2;
    let lane = ends.findIndex((end) => left >= end + 10);
    if (lane === -1) lane = ends.length;
    ends[lane] = point.x + point.size / 2;
    return { ...point, lane };
  });
}
