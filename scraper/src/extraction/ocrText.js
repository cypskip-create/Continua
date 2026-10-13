/**
 * OCR fallback for PDFs where native text extraction fails (§7 of the
 * original spec) — scanned documents, image-only pages. Only invoked
 * from pdfText.ts when native extraction comes back with insufficient
 * text; never runs on documents that already extracted fine natively.
 *
 * Pipeline: PDF -> rasterize each page to PNG via `pdftoppm` (poppler,
 * already a required dependency for pdftotext) -> OCR each page image
 * with tesseract.js -> concatenate text, average confidence across pages.
 *
 * Uses a LOCAL bundled trained-data package (@tesseract.js-data/eng)
 * rather than tesseract.js's default behavior of fetching language data
 * from a CDN (jsdelivr) at runtime. That default failed outright in a
 * network-restricted environment during testing, and even where network
 * access exists, depending on a third-party CDN at runtime for every
 * fresh deploy is an unnecessary reliability risk — bundling it as a
 * normal npm dependency avoids that entirely.
 *
 * Honesty about output quality: OCR confidence on real financial
 * documents is often mediocre even when the scan is high-quality — dense
 * multi-column tables confuse OCR reading order badly (confirmed against
 * a real NSE filing during testing: clean prose OCR'd perfectly, the
 * multi-column financial table portion did not). Tesseract's own
 * confidence score is used as-is and surfaced honestly rather than
 * smoothed over; low-confidence OCR results should need_review.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import { logger } from "../monitoring/logger.js";
import { createSerialWorkQueue } from "./serialWorkQueue.js";
export const OCR_PARSER_VERSION = "ocr-tesseract-0.1.0";
const MAX_PAGES = 15; // cap OCR work per document (§28 — bound processing cost)
const RASTER_DPI = 200;
// fileURLToPath, not raw `new URL(...).pathname` — the latter produces
// `/C:/Users/...` on Windows (a broken path with a leading slash before
// the drive letter). Same class of bug already hit and fixed once this
// session in announcementsWorker.ts — worth remembering going forward.
const TESSERACT_LANG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules/@tesseract.js-data/eng/4.0.0_best_int");
function rasterizePdf(pdfPath, outDir) {
    return new Promise((resolve, reject) => {
        execFile("pdftoppm", ["-png", "-r", String(RASTER_DPI), "-l", String(MAX_PAGES), pdfPath, path.join(outDir, "page")], { timeout: 60_000 }, (err) => (err ? reject(err) : resolve()));
    });
}
const enqueueOcr = createSerialWorkQueue();
export function extractPdfTextViaOcr(buffer) {
    // Adapter, cron sweep and manual reprocessing share this memory budget.
    return enqueueOcr(() => performOcr(buffer));
}
async function performOcr(buffer) {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "scraper-ocr-"));
    const pdfPath = path.join(tmpDir, "input.pdf");
    try {
        await (await import("node:fs/promises")).writeFile(pdfPath, buffer);
        await rasterizePdf(pdfPath, tmpDir);
        const pageFiles = (await readdir(tmpDir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
        if (pageFiles.length === 0) {
            return { method: "ocr", confidence: 0, text: null, tables: [], needsReview: true };
        }
        const worker = await createWorker("eng", 1, { langPath: TESSERACT_LANG_PATH, cachePath: tmpDir });
        const pageTexts = [];
        const confidences = [];
        try {
            for (const pageFile of pageFiles) {
                const result = await worker.recognize(path.join(tmpDir, pageFile));
                pageTexts.push(result.data.text);
                confidences.push(result.data.confidence);
            }
        }
        finally {
            await worker.terminate();
        }
        const text = pageTexts.join("\n\n-- page break --\n\n").trim();
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        // Tesseract reports 0-100; normalize to this codebase's 0-1 scale and
        // cap below native-extraction's ceiling — OCR should never look more
        // trustworthy than a clean native extraction, even at its best.
        const confidence = Math.min(0.85, avgConfidence / 100);
        return {
            method: "ocr",
            confidence,
            text: text.length > 0 ? text : null,
            tables: [], // table extraction on OCR'd text is unreliable enough to skip rather than fabricate structure
            // Always true, regardless of confidence score — confirmed against a
            // real document that even "good" (0.75) OCR confidence still
            // contains real character-level errors in financial figures (e.g.
            // "Cash generated from operations" OCR'd as "Conse fomopentons").
            // A plausible-looking wrong number is more dangerous than an
            // obviously garbled one; financial data via OCR should always get
            // human eyes before being trusted (§39 of the original spec).
            needsReview: true,
        };
    }
    catch (err) {
        logger.error({ err }, "OCR extraction failed");
        return { method: "ocr", confidence: 0, text: null, tables: [], needsReview: true };
    }
    finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    }
}
