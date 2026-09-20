/**
 * The contract every source adapter implements (§10 of the original
 * spec). The generic crawler (Phase 1, crawler/crawlSource.ts) handles
 * "follow links blindly within a domain" — that's the right approach for
 * an unknown/generic source. A source like NSE's announcements page
 * needs adapter-specific knowledge (which links are actual documents,
 * what metadata to pair with them) that must NOT leak into the generic
 * crawler. This interface is that boundary.
 *
 * NSE is the first real adapter (src/adapters/nse/announcementsAdapter.ts)
 * and intentionally does NOT reuse crawlSource.ts's queue-based loop —
 * its discover() step requires understanding the announcements page's
 * heading+link pairing, which is adapter knowledge, not generic crawling.
 */

export interface SourceDocument {
  /** The actual document/page to fetch. */
  url: string;
  /** Best-effort title captured during discovery, if any. */
  title?: string | null;
  /** Where this document was discovered (the listing/index page). */
  discoveredFrom: string;
  /** Adapter-specific context to carry through to the stored artifact's metadata. Never contains inferred tickers — see entity resolution note in types.ts. */
  context?: Record<string, unknown>;
}

export interface FetchedDocument {
  document: SourceDocument;
  sha256: string;
  contentType: string | null;
  sizeBytes: number;
  storagePath: string;
  body: Buffer;
  isNewArtifact: boolean;
  artifactId: number;
}

export interface ParsedExtraction {
  method: "native_pdf_text" | "ocr" | "html" | "table_ocr" | "csv" | "json" | "xml";
  confidence: number | null;
  text: string | null;
  tables: unknown[];
  /**
   * Entity guesses only — company_name/ticker as literally found in the
   * source. Never inferred (§12): if the source doesn't explicitly state
   * a ticker, this must be null, not a guess dressed up as a fact.
   */
  entity: {
    companyName: string | null;
    ticker: string | null;
    exchange: string;
    /** og:image from the article page, when the publisher sets one. Only
     *  ever read off the page's own metadata — never inferred/generated —
     *  so it's fine to display without the "confidence" caveats that
     *  apply to entity/ticker fields. Optional since most adapters (NSE
     *  filings, etc.) have no concept of an article image at all. */
    imageUrl?: string | null;
  };
  needsReview: boolean;
}

export interface SourceAdapter {
  id: string;
  discover(): Promise<SourceDocument[]>;
  fetch(document: SourceDocument): Promise<FetchedDocument>;
  parse?(fetched: FetchedDocument): Promise<ParsedExtraction>;
}