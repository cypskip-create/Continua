import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRefreshTasks } from '../src/lib/refreshTasks.ts';
test('refresh retains successes alongside failures and missing optional data', async () => {
  const result = await runRefreshTasks([
    { label: 'quotes', run: async () => 123 },
    { label: 'history', run: async () => { throw { status: 404 }; } },
    { label: 'news', run: async () => { throw new Error('offline'); } },
    { label: 'slow', run: () => new Promise(() => {}) },
  ], 10);
  assert.deepEqual(result.map(r => r.status), ['updated', 'unavailable', 'failed', 'failed']);
});
