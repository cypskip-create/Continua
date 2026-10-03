/**
 * Row shapes for the `scraping` schema. Kept as plain interfaces mirroring
 * the DDL 1:1 — repositories map raw pg rows into these, nothing fancier.
 */

export interface SourceConfig {
  seeds?: string[];
  allowedDomains?: string[];
  maxDepth?: number;
  concurrency?: number;
  requestsPerSecond?: number;
  /** Cron expression for how often this source should run — Phase 6. Falls back to env.DEFAULT_CRAWL_CRON if unset. */
  schedule?: string;
  /** RSS/Atom feed URL — required for sources using the 'rss' adapter (Phase 7). */
  feedUrl?: string;
  /** Bound each RSS run so one unexpectedly large feed cannot monopolize a worker. */
  maxItemsPerRun?: number;
  documents?: {
    pdf?: boolean;
    ocr?: boolean;
    tables?: boolean;
  };
  [key: string]: unknown; // adapters can stash their own extra config here
}

export interface Source {
  id: string;
  name: string;
  adapter: string;
  enabled: boolean;
  config: SourceConfig;
  termsUrl: string | null;
  robotsUrl: string | null;
  license: string | null;
  allowedUsage: string | null;
  redistributionAllowed: boolean | null;
  attributionRequired: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export type SourceDefinition = Omit<Source, "createdAt" | "updatedAt">;

export type CrawlStatus = "discovered" | "queued" | "crawling" | "crawled" | "failed" | "skipped";

export interface CrawlStateRow {
  id: number;
  sourceId: string;
  url: string;
  canonicalUrl: string | null;
  parentUrl: string | null;
  depth: number;
  status: CrawlStatus;
  mimeType: string | null;
  httpStatus: number | null;
  contentHash: string | null;
  firstSeen: string;
  lastSeen: string;
  lastCrawled: string | null;
  lastChanged: string | null;
  errorReason: string | null;
}

export interface RawArtifact {
  id: number;
  sourceId: string;
  adapter: string;
  sha256: string;
  documentUrl: string;
  sourceUrl: string | null;
  parentUrl: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  title: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  retrievedAt: string;
  crawlerVersion: string;
  metadata: Record<string, unknown>;
}

export type ExtractionMethod = "native_pdf_text" | "ocr" | "html" | "table_ocr" | "csv" | "json" | "xml";

export interface Extraction {
  id: number;
  artifactId: number;
  method: ExtractionMethod;
  confidence: number | null;
  parserVersion: string;
  text: string | null;
  tables: unknown[];
  entity: Record<string, unknown>;
  needsReview: boolean;
  extractedAt: string;
}

export interface NewRawArtifact {
  sourceId: string;
  adapter: string;
  sha256: string;
  documentUrl: string;
  sourceUrl?: string | null;
  parentUrl?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  storagePath: string;
  title?: string | null;
  publishedAt?: string | null;
  crawlerVersion: string;
  metadata?: Record<string, unknown>;
}
