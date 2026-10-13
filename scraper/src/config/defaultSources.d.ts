import type { SourceDefinition } from "../types.js";
/** Public first-party feeds. Continua stores provenance, a short excerpt,
 * attribution, and the canonical source link; it does not republish full
 * articles. Operators can disable or edit any seeded row and that choice is
 * preserved because startup only inserts missing IDs. */
export declare const DEFAULT_SOURCES: SourceDefinition[];
export declare function ensureDefaultSources(): Promise<void>;
