/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import type { IExchangeAdapter } from "../../adapters/types.js";
import { indexCollector } from "../collectors/indexCollector.js";
import { normalizeIndex } from "../../normalization/indices/normalizeIndex.js";
import { validateBatch } from "../validators/validate.js";
import { IndexSchema } from "../validators/schemas.js";
import { indicesRepository } from "../../storage/repositories/indicesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { logger } from "../../monitoring/logger.js";
import type { MarketIndex } from "../../types/market.js";

export async function runIndexIngestion(adapter: IExchangeAdapter): Promise<void> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let stored: MarketIndex[] = [];

  try {
    const raw = await indexCollector.collectIndices(adapter);
    const normalized = raw.map(normalizeIndex);
    const { valid: validShapes, rejected } = validateBatch(IndexSchema, normalized);
    for (const r of rejected) {
      errors.push(`Index rejected: ${JSON.stringify(r.issues)}`);
      await deadLetterRepository.record({
        exchange: adapter.exchange, dataset: "index",
        symbol: (r.record as any)?.code ?? null, payload: r.record,
        error: r.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
      });
    }
    const validIds = new Set(validShapes.map((v) => v.id));
    stored = normalized.filter((idx) => validIds.has(idx.id));

    if (stored.length > 0) {
      await indicesRepository.upsertIndicesBatch(stored);
      await cache.del(CacheKeys.indices(adapter.exchange));
    }
  } catch (err) {
    errors.push(`Index collection failed: ${String(err)}`);
    await deadLetterRepository.record({
      exchange: adapter.exchange, dataset: "index", symbol: null,
      payload: {}, error: String(err),
    });
  }

  await ingestionLogRepository.log({
    exchange: adapter.exchange, dataset: "index",
    status: errors.length === 0 ? "success" : (stored.length > 0 ? "partial" : "failed"),
    recordCount: stored.length, errorCount: errors.length,
    startedAt, finishedAt: new Date().toISOString(),
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });

  if (errors.length) logger.warn({ exchange: adapter.exchange, errorCount: errors.length }, "Index ingestion completed with errors");
}
