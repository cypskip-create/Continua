import type { ParsedExtraction } from "../adapters/types.js";
export declare const PDF_PARSER_VERSION: string;
export declare function extractPdfText(buffer: Buffer): Promise<Omit<ParsedExtraction, "entity">>;
