import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import { apiKeyRepository, hashApiKeyAsync } from '../storage/repositories/apiKeyRepository.js';
import { cache } from '../storage/cache.js';
import { logger } from '../monitoring/logger.js';

// No plaintext credentials in cache keys. TTL still bounds revocation to 30 seconds.
export function findApiKey(presented: string) {
  const fingerprint = createHash('sha256').update(presented).digest('hex');
  return cache.getOrSet(`apikey-access:${fingerprint}`, 30_000, async () =>
    apiKeyRepository.findActiveByHash(await hashApiKeyAsync(presented)));
}

const touches = new LRUCache<string, boolean>({ max: 1000, ttl: 60_000 });
export function recordApiKeyUse(id: string): void {
  if (touches.has(id)) return;
  // Reserve before starting the write: concurrent requests must not queue identical updates.
  touches.set(id, true);
  void apiKeyRepository.touchLastUsed(id).catch(() => {
    // Audit timestamp is best-effort, NOT authentication. Never crash the process
    // or include key material in diagnostics. Keep the cooldown during an outage.
    logger.warn('API-key usage timestamp unavailable; authentication remains enforced');
  });
}
