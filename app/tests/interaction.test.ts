import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullDistance, REFRESH_THRESHOLD } from '../src/lib/pullGesture.ts';
import { layoutMetricBubbles } from '../src/lib/metricLayout.ts';

test('taps, horizontal swipes and upward scrolls never trigger refresh', () => {
  for (const [dx, dy] of [[0, 0], [2, 8], [100, 20], [0, -160], [90, 100]])
    assert.equal(pullDistance(dx, dy), 0);
});
test('only a deliberate long downward pull reaches the refresh threshold', () => {
  assert.ok(pullDistance(5, 80) < REFRESH_THRESHOLD);
  assert.ok(pullDistance(5, 180) >= REFRESH_THRESHOLD);
  assert.equal(pullDistance(0, 1000), 96);
});
test('twelve identical metrics stay individually accessible', () => {
  const result = layoutMetricBubbles(Array.from({ length: 12 }, () => ({ x: 100, size: 68 })));
  assert.equal(new Set(result.map((point) => point.lane)).size, 12);
});
test('pixel-sized bubbles do not overlap within a lane on narrow screens', () => {
  const result = layoutMetricBubbles(Array.from({ length: 30 }, (_, i) => ({ x: (i * 17) % 240, size: 38 + i % 31 })));
  for (const a of result) for (const b of result) {
    if (a === b || a.lane !== b.lane) continue;
    assert.ok(Math.abs(a.x - b.x) >= (a.size + b.size) / 2 + 10);
  }
});
