import type { Source, SourceDefinition } from "../types.js";
export declare function listEnabledSources(): Promise<Source[]>;
export declare function getSource(id: string): Promise<Source | null>;
/**
 * Upsert a source definition. Sources are meant to be declared in code
 * (one config object per adapter, per §41 — "do not hardcode websites
 * throughout the codebase") and synced into this table at boot, not
 * edited by hand in the DB.
 */
export declare function upsertSource(source: SourceDefinition): Promise<void>;
/** Install a built-in source only when an operator has not already created
 * it. Unlike upsertSource, this deliberately preserves a manual disable or
 * local configuration change across restarts. */
export declare function insertSourceIfMissing(source: SourceDefinition): Promise<void>;
