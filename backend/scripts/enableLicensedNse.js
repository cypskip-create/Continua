/** Explicit operator action only. Startup must never assume an NSE licence. */
import { query, pool } from '../src/storage/db.js';
try {
    const reference = process.argv[2];
    if (!reference || !process.argv.includes('--scope-confirmed'))
        throw new Error('Usage: tsx scripts/enableLicensedNse.ts "permission reference" --scope-confirmed');
    const audit = { permissionReference: reference, permissionConfirmedAt: new Date().toISOString(),
        permissionEvidence: 'operator_attestation',
        permissionScope: ['historical_prices', 'indices', 'bonds', 'derivatives', 'automated_downloads', 'paid_app_display'] };
    const result = await query(`UPDATE scraping.sources SET enabled=true,config=config || $1::jsonb,
    license=$2,updated_at=now() WHERE id IN ('nse-index-summary','nse-market-reports')
    RETURNING id,enabled,config->>'permissionReference' AS permission_reference`, [JSON.stringify(audit), 'Written NSE approval reported by operator; retain original approval separately']);
    if (result.rowCount !== 2)
        throw new Error('Expected both registered NSE collectors; inspect source registry');
    console.log(JSON.stringify(result.rows));
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
finally {
    await pool.end();
}
