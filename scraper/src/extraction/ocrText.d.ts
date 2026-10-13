import type { ParsedExtraction } from "../adapters/types.js";
export declare const OCR_PARSER_VERSION = "ocr-tesseract-0.1.0";
export declare function extractPdfTextViaOcr(buffer: Buffer): Promise<Omit<ParsedExtraction, "entity">>;
