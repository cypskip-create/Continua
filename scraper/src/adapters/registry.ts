/**
 * Maps a source's `adapter` field to how it should actually be run
 * (§10-11 of the original spec: "adding a new source should mean adding
 * an adapter, not rewriting the core"). Sources whose adapter isn't
 * registered here fall back to the generic link-following crawler
 * (crawler/crawlSource.ts) — that's the correct default for an unknown/
 * generic source, and exactly why the generic crawler exists.
 *
 * Entries are factories, not fixed instances — 'rss' needs the specific
 * source's config.feedUrl to build a working adapter (Phase 7: one
 * adapter implementation serves many different RSS sources, each
 * configured differently, not one hardcoded feed).
 */
import { runAdapter, type AdapterRunSummary } from "./runAdapter.js";
import { nseAnnouncementsAdapter } from "./nse/announcementsAdapter.js";
import { createRssFeedAdapter } from "./rss/createRssFeedAdapter.js";
import { kenyanstocksAdapter } from "./kenyanstocks/kenyanstocksAdapter.js";
import {afxAdapter} from './afx/afxAdapter.js';
import type { SourceAdapter } from "./types.js";
import type { Source } from "../types.js";
import type { CrawlSummary } from "../crawler/crawlSource.js";
import { requeueIncompleteDocuments } from '../storage/documentJobsRepository.js';
import { logger } from '../monitoring/logger.js';

type AdapterFactory = (source: Source) => SourceAdapter;

const adapterFactories: Record<string, AdapterFactory> = {
  nse: () => nseAnnouncementsAdapter,
  rss: (source) => createRssFeedAdapter(source),
  // Renders with a real headless browser, unlike every other adapter
  // here — see kenyanstocksAdapter.ts's doc comment for why, and for
  // what it deliberately does NOT attempt to parse yet.
  kenyanstocks: () => kenyanstocksAdapter,
  afx:()=>afxAdapter,
};

export function hasRegisteredAdapter(adapterId: string): boolean {
  return adapterId in adapterFactories;
}

export async function runRegisteredAdapter(source: Source, options: { drainOnly?: boolean; batchSize?: number } = {}): Promise<AdapterRunSummary> {
  const factory = adapterFactories[source.adapter];
  if (!factory) throw new Error(`No adapter registered for id: ${source.adapter}`);
  const adapter = factory(source);
  if (options.drainOnly && !adapter.persistentBatchSize) throw new Error('Adapter has no durable document queue');
  if (options.drainOnly) {
    try { await requeueIncompleteDocuments(source.id, options.batchSize ?? adapter.persistentBatchSize!); }
    catch (err) { logger.warn({ sourceId: source.id, err }, 'Legacy extraction recovery failed; continuing queued document work'); }
  }
  return runAdapter(options.drainOnly ? { ...adapter, persistentBatchSize: options.batchSize ?? adapter.persistentBatchSize, discover: async () => [] } : adapter);
}

export type { CrawlSummary };
