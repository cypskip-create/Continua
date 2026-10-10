/**
 * Generic runner for any SourceAdapter — not just NSE. Ties discover()
 * -> fetch() -> parse() together and persists extractions. Kept separate
 * from crawler/crawlSource.ts because adapters don't use the crawl_state
 * queue (they discover their own full list of documents each run) — a
 * different, simpler execution shape than the generic link-following
 * crawler.
 */
import { insertExtraction, findLatestExtraction } from "../storage/extractionsRepository.js";
import { enqueueDocuments, claimDocuments, finishDocument } from "../storage/documentJobsRepository.js";
import { recordDeadLetter } from "../storage/deadLettersRepository.js";
import { logger } from "../monitoring/logger.js";
import type { SourceAdapter } from "./types.js";

export interface AdapterRunSummary {
  adapterId: string;
  discovered: number;
  fetched: number;
  newArtifacts: number;
  extracted: number;
  needsReview: number;
  failed: number;
}

export async function runAdapter(adapter: SourceAdapter): Promise<AdapterRunSummary> {
  const summary: AdapterRunSummary = {
    adapterId: adapter.id,
    discovered: 0,
    fetched: 0,
    newArtifacts: 0,
    extracted: 0,
    needsReview: 0,
    failed: 0,
  };

  const documents = await adapter.discover();
  summary.discovered = documents.length;

  const jobs = adapter.persistentBatchSize ? (await enqueueDocuments(adapter.id, documents), await claimDocuments(adapter.id, adapter.persistentBatchSize)) : null;
  const pending = jobs ? jobs.map(job => job.document) : [...documents];
  const jobByUrl = new Map(jobs?.map(job => [job.document.url, job]) ?? []);
  const workCount = pending.length;
  const processNext = async (): Promise<void> => {
    for (;;) {
      const doc = pending.shift();
      if (!doc) return;
    try {
      const fetched = await adapter.fetch(doc);
      summary.fetched++;
      if (fetched.isNewArtifact) summary.newArtifacts++;

      // Only bother re-parsing artifacts we haven't seen before — an
      // unchanged PDF doesn't need re-extraction (§17, §44 — idempotent).
      if (!fetched.isNewArtifact && await findLatestExtraction(fetched.artifactId)) {
        const job = jobByUrl.get(doc.url);
        if (job) await finishDocument(job.id, job.attempts);
        continue;
      }

      if (!adapter.parse) {
        const job = jobByUrl.get(doc.url);
        if (job) await finishDocument(job.id, job.attempts);
        continue;
      }
      const parsed = await adapter.parse(fetched);
      await insertExtraction({
        artifactId: fetched.artifactId,
        method: parsed.method,
        confidence: parsed.confidence,
        parserVersion: "adapter-runner-0.1.0",
        text: parsed.text,
        tables: parsed.tables,
        entity: parsed.entity,
        needsReview: parsed.needsReview,
      });
      summary.extracted++;
      if (parsed.needsReview) summary.needsReview++;
      const job = jobByUrl.get(doc.url);
      if (job) await finishDocument(job.id, job.attempts);
    } catch (err) {
      const reason = String((err as Error).message ?? err);
      logger.warn({ url: doc.url, reason }, "Adapter run: document failed");
      // adapter.fetch()/parse() already retried internally via
      // fetchWithRetry where applicable — reaching this catch means those
      // retries were exhausted, so this is the final record (§21).
      await recordDeadLetter({ sourceId: adapter.id, url: doc.url, stage: "fetch", reason });
      summary.failed++;
      const job = jobByUrl.get(doc.url);
      if (job) await finishDocument(job.id, job.attempts, reason);
    }
    }
  };

  const concurrency = Math.max(1, Math.min(adapter.documentConcurrency ?? 1, 8));
  await Promise.all(Array.from({ length: Math.min(concurrency, workCount) }, processNext));

  logger.info(summary, "Adapter run complete");
  return summary;
}
