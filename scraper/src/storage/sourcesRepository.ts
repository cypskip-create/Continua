import { query } from "./db.js";
import type { Source, SourceDefinition } from "../types.js";

interface SourceRow {
  id: string;
  name: string;
  adapter: string;
  enabled: boolean;
  config: Record<string, unknown>;
  terms_url: string | null;
  robots_url: string | null;
  license: string | null;
  allowed_usage: string | null;
  redistribution_allowed: boolean | null;
  attribution_required: boolean | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    adapter: row.adapter,
    enabled: row.enabled,
    config: row.config,
    termsUrl: row.terms_url,
    robotsUrl: row.robots_url,
    license: row.license,
    allowedUsage: row.allowed_usage,
    redistributionAllowed: row.redistribution_allowed,
    attributionRequired: row.attribution_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEnabledSources(): Promise<Source[]> {
  const res = await query<SourceRow>(`SELECT * FROM scraping.sources WHERE enabled = true ORDER BY id`);
  return res.rows.map(mapRow);
}

export async function getSource(id: string): Promise<Source | null> {
  const res = await query<SourceRow>(`SELECT * FROM scraping.sources WHERE id = $1`, [id]);
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/**
 * Upsert a source definition. Sources are meant to be declared in code
 * (one config object per adapter, per §41 — "do not hardcode websites
 * throughout the codebase") and synced into this table at boot, not
 * edited by hand in the DB.
 */
export async function upsertSource(source: SourceDefinition): Promise<void> {
  await query(
    `INSERT INTO scraping.sources
       (id, name, adapter, enabled, config, terms_url, robots_url, license, allowed_usage, redistribution_allowed, attribution_required, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       adapter = EXCLUDED.adapter,
       enabled = EXCLUDED.enabled,
       config = EXCLUDED.config,
       terms_url = EXCLUDED.terms_url,
       robots_url = EXCLUDED.robots_url,
       license = EXCLUDED.license,
       allowed_usage = EXCLUDED.allowed_usage,
       redistribution_allowed = EXCLUDED.redistribution_allowed,
       attribution_required = EXCLUDED.attribution_required,
       updated_at = now()`,
    [
      source.id,
      source.name,
      source.adapter,
      source.enabled,
      JSON.stringify(source.config),
      source.termsUrl,
      source.robotsUrl,
      source.license,
      source.allowedUsage,
      source.redistributionAllowed,
      source.attributionRequired,
    ],
  );
}


/** Install a built-in source only when an operator has not already created
 * it. Unlike upsertSource, this deliberately preserves a manual disable or
 * local configuration change across restarts. */
export async function insertSourceIfMissing(source: SourceDefinition): Promise<void> {
  await query(
    `INSERT INTO scraping.sources
       (id, name, adapter, enabled, config, terms_url, robots_url, license, allowed_usage, redistribution_allowed, attribution_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      source.id,
      source.name,
      source.adapter,
      source.enabled,
      JSON.stringify(source.config),
      source.termsUrl,
      source.robotsUrl,
      source.license,
      source.allowedUsage,
      source.redistributionAllowed,
      source.attributionRequired,
    ],
  );
}
