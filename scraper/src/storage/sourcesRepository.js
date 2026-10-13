import { query } from "./db.js";
function mapRow(row) {
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
export async function listEnabledSources() {
    const res = await query(`SELECT * FROM scraping.sources WHERE enabled = true ORDER BY id`);
    return res.rows.map(mapRow);
}
export async function getSource(id) {
    const res = await query(`SELECT * FROM scraping.sources WHERE id = $1`, [id]);
    return res.rows[0] ? mapRow(res.rows[0]) : null;
}
/**
 * Upsert a source definition. Sources are meant to be declared in code
 * (one config object per adapter, per §41 — "do not hardcode websites
 * throughout the codebase") and synced into this table at boot, not
 * edited by hand in the DB.
 */
export async function upsertSource(source) {
    await query(`INSERT INTO scraping.sources
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
       updated_at = now()`, [
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
    ]);
}
/** Install a built-in source only when an operator has not already created
 * it. Unlike upsertSource, this deliberately preserves a manual disable or
 * local configuration change across restarts. */
export async function insertSourceIfMissing(source) {
    await query(`INSERT INTO scraping.sources
       (id, name, adapter, enabled, config, terms_url, robots_url, license, allowed_usage, redistribution_allowed, attribution_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`, [
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
    ]);
}
