/**
 * Native text extraction for text-based PDFs (§5-6 of the original spec).
 * Deliberately does NOT attempt OCR — that's a separate, heavier pipeline
 * (Phase 5). A scanned PDF will come back here with near-zero extracted
 * text; this module's job is to detect that honestly (low confidence,
 * needsReview: true) rather than pretend the extraction succeeded.
 *
 * Table extraction (§6, Phase 3): pdf-parse v2's built-in `getTable()`
 * was tried first and returned empty results against multiple synthetic
 * test tables (bordered and borderless), so financial tables here come
 * from a text-based heuristic instead — see tableExtract.ts for details
 * and its documented limitations.
 */
/**
 * Native text extraction for text-based PDFs (§5-6 of the original spec),
 * with an OCR fallback (§7, Phase 5) for scanned/image-only documents
 * where native extraction comes back near-empty. OCR is deliberately
 * only attempted as a fallback, never the first attempt — it's an order
 * of magnitude slower (~6-7s per document vs. under a second for native
 * text) and its output is inherently less reliable, so there's no reason
 * to pay that cost on documents native extraction already handles fine.
 *
 * Table extraction (§6, Phase 3): pdf-parse v2's built-in `getTable()`
 * was tried first and returned empty results against multiple synthetic
 * test tables (bordered and borderless), so financial tables here come
 * from a text-based heuristic instead — see tableExtract.ts for details
 * and its documented limitations. Table extraction is NOT attempted on
 * OCR'd text — confirmed against a real scanned NSE filing that OCR
 * garbles multi-column table layouts badly enough that running the table
 * heuristic on it would fabricate structure, not recover it.
 */
import { PDFParse } from "pdf-parse";
import type { ParsedExtraction } from "../adapters/types.js";
import { logger } from "../monitoring/logger.js";
import { extractTablesFromText } from "./tableExtract.js";
import { extractPdfTextViaOcr } from "./ocrText.js";

export const PDF_PARSER_VERSION = "native-pdf-text-0.3.0";

// Below this many characters of extracted text, treat the PDF as
// effectively unextracted (scanned/image-based PDFs typically yield
// near-zero characters, not merely "few" — a short but genuine document,
// like a one-paragraph dividend notice, can legitimately land under 200
// chars, so the bar is set low enough to only catch the near-empty case).
const MIN_USABLE_TEXT_LENGTH = 50;

async function extractNativePdfText(buffer: Buffer): Promise<Omit<ParsedExtraction, "entity">> {
  const data = new Uint8Array(buffer);
  const parser = new PDFParse({ data });
  let text = "";
  let pageCount = 0;

  try {
    // pdf.js' Node fake-worker path can throw DataCloneError when multiple
    // requests share the same MessageHandler concurrently. Keep calls
    // sequential; otherwise real NSE PDFs fail inside structuredClone().
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();

    text = textResult.text.trim();
    pageCount = infoResult.total;
  } catch (err) {
    logger.error({ err }, "PDF text extraction threw an exception");
    return { method: "native_pdf_text", confidence: 0, text: null, tables: [], needsReview: true };
  } finally {
    // pdf-parse 2.x can leave its internal document in a partially-created
    // state (notably when paired with an overridden pdfjs-dist). Cleanup
    // must never turn a successful extraction or OCR fallback into a hard
    // failure. Keep this guard until upstream's destroy() is idempotent.
    try {
      await parser.destroy();
    } catch (err) {
      logger.warn({ err }, "PDF parser cleanup failed");
    }
  }

  const looksUsable = text.length >= MIN_USABLE_TEXT_LENGTH;
  const avgCharsPerPage = pageCount > 0 ? text.length / pageCount : text.length;
  const confidence = !looksUsable ? 0.1 : Math.min(0.95, 0.5 + avgCharsPerPage / 4000);
  const tables = looksUsable ? extractTablesFromText(text) : [];

  return {
    method: "native_pdf_text",
    confidence,
    text: looksUsable ? text : text || null,
    tables,
    needsReview: !looksUsable,
  };
}

export async function extractPdfText(buffer: Buffer): Promise<Omit<ParsedExtraction, "entity">> {
  const native = await extractNativePdfText(buffer);
  if (native.text && native.text.length >= MIN_USABLE_TEXT_LENGTH) {
    return native;
  }

  logger.info("Native PDF text extraction insufficient — falling back to OCR");
  const ocr = await extractPdfTextViaOcr(buffer);

  // Only prefer the OCR result if it actually produced more than native
  // did — a native extraction returning a handful of real characters is
  // still more trustworthy than nothing, and OCR on a genuinely empty/
  // corrupt PDF won't produce anything useful either.
  if (ocr.text && (!native.text || ocr.text.length > native.text.length)) {
    return ocr;
  }
  return native;
}
