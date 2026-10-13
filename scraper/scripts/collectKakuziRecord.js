import dotenv from 'dotenv';
dotenv.config({ path: '../backend/.env.local', quiet: true });
// Keep this operator backfill durable, just like the deployed private archive.
process.env.RAW_STORAGE_DRIVER = 'supabase';
const remote = process.argv.includes('--remote');
const { pool, query } = await import('../src/storage/db.js');
const { DEFAULT_SOURCES } = await import('../src/config/defaultSources.js');
const { insertSourceIfMissing } = await import('../src/storage/sourcesRepository.js');
const { crawlSource } = await import('../src/crawler/crawlSource.js');
const { reprocessArtifact } = await import('../src/extraction/reprocessArtifact.js');
const { insertExtraction } = await import('../src/storage/extractionsRepository.js');
const { extractByContentType } = await import('../src/extraction/extractByContentType.js');
const { createHash } = await import('node:crypto');
try {
    const source = DEFAULT_SOURCES.find(s => s.id === 'kakuzi-record-filings');
    await insertSourceIfMissing(source);
    if (process.argv.includes('--retry-failed'))
        await query("UPDATE scraping.crawl_state SET status='discovered' WHERE source_id=$1 AND url=$2 AND status='failed'", [source.id, source.config.seeds[0]]);
    const response = remote ? await fetch(`https://continua-scraper.onrender.com/sources/${source.id}/crawl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchSize: 1 }), signal: AbortSignal.timeout(120000), redirect: 'error' }) : null;
    if (response && !response.ok)
        throw new Error('Deployed collection unavailable');
    const crawl = remote ? await response.json() : await crawlSource(source.id, 1);
    console.log(JSON.stringify({ crawl }));
    const row = (await query("SELECT id,sha256,content_type FROM scraping.raw_artifacts WHERE source_id=$1 AND document_url=$2 ORDER BY retrieved_at DESC LIMIT 1", [source.id, source.config.seeds[0]])).rows[0];
    if (!row || crawl.failed)
        throw new Error('Registered issuer record could not be archived');
    let extraction;
    if (remote) {
        // Deployed collector owns the private raw upload. Re-extract only identical
        // public bytes locally with the new parser; never fetch the storage key.
        const page = await fetch(source.config.seeds[0], { signal: AbortSignal.timeout(45000), redirect: 'error' });
        if (!page.ok)
            throw new Error('Issuer record unavailable');
        const body = Buffer.from(await page.arrayBuffer());
        if (body.length > 2_000_000 || createHash('sha256').update(body).digest('hex') !== row.sha256)
            throw new Error('Downloaded record differs from immutable archive');
        const result = await extractByContentType(row.content_type, body);
        if (!result)
            throw new Error('Unsupported issuer document');
        extraction = await insertExtraction({ artifactId: Number(row.id), parserVersion: 'kakuzi-html-header-v2', ...result });
    }
    else
        extraction = await reprocessArtifact(Number(row.id));
    console.log(JSON.stringify({ crawl, artifactId: Number(row.id), extractionId: extraction.id, method: extraction.method, tables: extraction.tables.length }));
}
catch {
    console.error('Issuer archive collection failed; existing facts preserved.');
    process.exitCode = 1;
}
finally {
    await pool.end();
}
