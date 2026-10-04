/**
 * Single place that knows how to turn raw bytes + a content type into an
 * extraction, shared by reprocessArtifact.ts (manual, one artifact at a
 * time) and extractionSweep.ts (automatic, batch). Previously this logic
 * was duplicated inline in reprocessArtifact.ts — pulling it out here
 * means a fix to how a content type is handled applies to both paths
 * instead of silently drifting apart.
 *
 * Returns null for a content type nothing here knows how to handle,
 * rather than throwing — callers decide whether "unsupported" is an
 * error (reprocessArtifact.ts, where the caller named this artifact
 * specifically) or something to skip quietly (extractionSweep.ts, which
 * will hit plenty of images/CSS/etc. it was never meant to parse).
 */
import { extractPdfText } from "./pdfText.js";
import { extractArticleBodyText } from "./articleBodyText.js";
import type { ExtractionMethod } from "../types.js";
import { extractHtmlFinancialTables } from "./htmlFinancialTables.js";
import { extractNseIndexSummary } from "./nseIndexSummary.js";

const MIN_USABLE_HTML_TEXT_LENGTH = 100;

export interface ContentExtractionResult {
  method: ExtractionMethod;
  confidence: number | null;
  text: string | null;
  tables: unknown[];
  needsReview: boolean;
}

export async function extractByContentType(
  contentType: string | null,
  body: Buffer,
): Promise<ContentExtractionResult | null> {
  const type = contentType ?? "";

  if (type.includes("application/pdf")) {
    const result = await extractPdfText(body);
    return {
      method: result.method,
      confidence: result.confidence,
      text: result.text,
      tables: result.tables,
      needsReview: result.needsReview,
    };
  }

  if (type.includes("text/html")) {
    const tables = extractHtmlFinancialTables(body.toString("utf-8"));
    const indices = extractNseIndexSummary(body.toString("utf-8"));
    const text = extractArticleBodyText(body.toString("utf-8"));
    const looksUsable = text.length >= MIN_USABLE_HTML_TEXT_LENGTH;
    return {
      method: "html",
      confidence: looksUsable ? 0.6 : 0.1,
      text: looksUsable ? text : null,
      tables: [...tables, ...indices],
      needsReview: tables.length > 0 || (!looksUsable && indices.length === 0),
    };
  }

  return null;
}
