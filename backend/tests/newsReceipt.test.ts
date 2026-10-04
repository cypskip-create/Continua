import { expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/storage/db.js', () => ({ query: vi.fn(), withTransaction: (fn: (client: typeof tx) => unknown) => fn(tx) }));
import { newsRepository } from '../src/storage/repositories/newsRepository.js';
it('updates an existing article URL receipt instead of violating the canonical unique index', async () => {
  tx.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT id') ? [{ id: 'existing-id' }] : [] }));
  await newsRepository.upsert({ headline: 'KCB earnings', excerpt: 'KCB earnings improve', articleUrl: 'https://example.com/earnings?utm_source=rss', source: 'test', sourceName: 'Test', category: 'earnings', imageUrl: null, securityIds: ['NSE:KCB'], scrapedArtifactId: 2, scrapedExtractionId: 3, extractionConfidence: 1, needsReview: false, publishedAt: '2026-10-03' });
  expect(tx.query.mock.calls.some(([sql]) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
  expect(tx.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE market.news_items'))).toBe(true);
  expect(tx.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO market.news_items'))).toBe(false);
});
