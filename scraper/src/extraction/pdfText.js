/**
 * Isolated Poppler layout extraction for text-based PDFs,
 * with an OCR fallback (§7, Phase 5) for scanned/image-only documents
 * where native extraction comes back near-empty. OCR is deliberately
 * only attempted as a fallback, never the first attempt — it's an order
 * of magnitude slower (~6-7s per document vs. under a second for native
 * text) and its output is inherently less reliable, so there's no reason
 * to pay that cost on documents native extraction already handles fine.
 *
 * Financial tables come from a text-based heuristic: see tableExtract.ts
 * and its documented limitations. Table extraction is NOT attempted on
 * OCR'd text — confirmed against a real scanned NSE filing that OCR
 * garbles multi-column table layouts badly enough that running the table
 * heuristic on it would fabricate structure, not recover it.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from "../monitoring/logger.js";
import { extractTablesFromText } from "./tableExtract.js";
import { extractPdfTextViaOcr } from "./ocrText.js";
export const PDF_PARSER_VERSION = env.PDF_NATIVE_ENGINE === 'python' ? 'pdfplumber-layout-text-0.1.0' : 'poppler-layout-text-0.4.0';
const run = promisify(execFile);
// Below this many characters of extracted text, treat the PDF as
// effectively unextracted (scanned/image-based PDFs typically yield
// near-zero characters, not merely "few" — a short but genuine document,
// like a one-paragraph dividend notice, can legitimately land under 200
// chars, so the bar is set low enough to only catch the near-empty case).
const MIN_USABLE_TEXT_LENGTH = 50;
async function extractNativePdfText(buffer) {
    const directory = await mkdtemp(path.join(tmpdir(), "continua-pdf-"));
    const input = path.join(directory, "input.pdf");
    let text = "";
    let pageCount = 0;
    let truncated = false;
    let tableText;
    try {
        await writeFile(input, buffer);
        // Preserve row spacing/column order. Isolated processes avoid pdf.js'
        // shared fake-worker lifecycle failures. Poppler is installed in Docker.
        if (env.PDF_NATIVE_ENGINE === 'python') {
            const worker = fileURLToPath(new URL('../../python/pdf_extract.py', import.meta.url));
            const result = await run(env.PYTHON_BIN, [worker, input], { timeout: 60000, maxBuffer: 20 * 1024 * 1024, windowsHide: true,
                env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PYTHONUTF8: '1' } });
            const extracted = z.object({ text: z.string(), tableText: z.string(), pageCount: z.number().int().min(0).max(500), truncated: z.boolean(), parserVersion: z.literal('pdfplumber-0.11.9-layout-v1') }).parse(JSON.parse(result.stdout));
            text = extracted.text.trim();
            pageCount = extracted.pageCount;
            truncated = extracted.truncated;
            tableText = extracted.tableText;
        }
        else {
            const result = await run("pdftotext", ["-layout", "-enc", "UTF-8", "-l", "500", input, "-"], { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 });
            text = result.stdout.trim();
            pageCount = Math.max(1, result.stdout.split("\f").length - 1);
        }
    }
    catch (err) {
        logger.error({ err }, "PDF text extraction threw an exception");
        return { parserVersion: PDF_PARSER_VERSION, method: "native_pdf_text", confidence: 0, text: null, tables: [], needsReview: true };
    }
    finally {
        // directory is an OS-generated dedicated temporary directory, not a
        // user path. Cleanup never masks extraction/OCR results.
        await rm(directory, { recursive: true, force: true }).catch(() => { });
    }
    const looksUsable = text.length >= MIN_USABLE_TEXT_LENGTH;
    const avgCharsPerPage = pageCount > 0 ? text.length / pageCount : text.length;
    const confidence = !looksUsable ? 0.1 : Math.min(0.95, 0.5 + avgCharsPerPage / 4000);
    const tables = looksUsable ? extractTablesFromText(tableText ?? text) : [];
    return {
        parserVersion: PDF_PARSER_VERSION,
        method: "native_pdf_text",
        confidence,
        text: looksUsable ? text : text || null,
        tables,
        // A new parser is not proof of validated issuer/year/unit mappings.
        needsReview: env.PDF_NATIVE_ENGINE === 'python' || !looksUsable || truncated || pageCount >= 500,
    };
}
export async function extractPdfText(buffer) {
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
