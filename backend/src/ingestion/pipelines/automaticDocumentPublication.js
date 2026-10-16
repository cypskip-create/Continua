import { query, withTransaction } from '../../storage/db.js';
import { validateNativeAnnualReport, NATIVE_ANNUAL_VERSION } from '../normalizers/nativeAnnualReport.js';
import { draftCbkBondReport } from '../normalizers/cbkBondReport.js';
import { financialStatementCandidatesRepository } from '../../storage/repositories/financialStatementCandidatesRepository.js';
import { confirmHistoricalColumns } from '../confirmHistoricalColumns.js';
import { logger } from '../../monitoring/logger.js';
import { validateCondensedGroupReport, CONDENSED_GROUP_VERSION } from '../normalizers/condensedGroupReport.js';
import { pricesRepository } from '../../storage/repositories/pricesRepository.js';
import { researchService } from '../../services/research/researchService.js';
import { cache, CacheKeys } from '../../storage/cache.js';
import { validateSafaricomPressReport, SAFARICOM_PRESS_VERSION } from '../normalizers/safaricomPressReport.js';
import { validateKakuziGroupReport, KAKUZI_GROUP_VERSION } from '../normalizers/kakuziGroupReport.js';
import { validateKcbGroupReport, KCB_GROUP_VERSION } from '../normalizers/kcbGroupReport.js';
import { validateKakuziHtmlRecord, KAKUZI_HTML_VERSION } from '../normalizers/kakuziHtmlRecord.js';
import { issuerMastheadMatches } from '../normalizers/issuerIdentity.js';
import { engineCacheKeys } from '../../services/research/engineCacheKeys.js';
export const DOCUMENT_VALIDATOR_VERSION = `${NATIVE_ANNUAL_VERSION}:${CONDENSED_GROUP_VERSION}:${SAFARICOM_PRESS_VERSION}:${KAKUZI_GROUP_VERSION}:${KCB_GROUP_VERSION}:${KAKUZI_HTML_VERSION}:canonical-nse-v6:cbk-reopened-v1`;
let active;
/** Bounded, versioned, automatic publication after deterministic validation.
 * OCR, unknown layouts and canonical conflicts retain their review state.
 * Every result is traceable to an immutable extraction and source SHA.
 */
export function runAutomaticDocumentPublication(limit = 25, extractionIds) {
    if (active)
        return active;
    active = run(Math.min(100, Math.max(1, limit)), extractionIds).finally(() => { active = undefined; });
    return active;
}
async function run(limit, extractionIds) {
    const pending = await query(`SELECT e.id,e.artifact_id,e.method,e.text,e.tables,e.needs_review,e.extracted_at,a.retrieved_at,a.sha256,a.document_url,a.source_id,
    a.title,s.config FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
    JOIN scraping.sources s ON s.id=a.source_id WHERE s.enabled AND (a.content_type LIKE '%application/pdf%' OR (a.source_id='kakuzi-record-filings' AND a.content_type LIKE '%text/html%'))
    AND a.sha256 ~ '^[a-f0-9]{64}$' AND e.text IS NOT NULL
    AND (a.source_id='nse' OR a.source_id='cbk-bond-history' OR a.source_id='kenyanstocks' OR a.source_id LIKE '%-filings')
    AND ($3::bigint[] IS NULL OR e.id=ANY($3))
    AND NOT EXISTS(SELECT 1 FROM scraping.extractions newer WHERE newer.artifact_id=e.artifact_id
      AND (newer.extracted_at>e.extracted_at OR (newer.extracted_at=e.extracted_at AND newer.id>e.id)))
    AND NOT EXISTS(SELECT 1 FROM market.document_validations v WHERE v.extraction_id=e.id AND v.validator_version=$1)
    ORDER BY e.id ASC LIMIT $2`, [DOCUMENT_VALIDATOR_VERSION, limit, extractionIds ?? null]);
    const summary = { published: 0, review: 0, failed: 0 };
    for (const row of pending.rows) {
        try {
            await withTransaction(async (db) => {
                const lock = await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('document-validation:' || $1::text,0)) AS locked", [row.id]);
                if (!lock.rows[0]?.locked)
                    return;
                if ((await db.query('SELECT 1 FROM market.document_validations WHERE extraction_id=$1 AND validator_version=$2', [row.id, DOCUMENT_VALIDATOR_VERSION])).rowCount)
                    return;
                let outcome = 'review', reason = 'Unsupported extraction', result = {};
                await db.query('SAVEPOINT canonical_publication');
                try {
                    const isKakuziHtml = row.method === 'html' && row.source_id === 'kakuzi-record-filings';
                    if (row.method !== 'native_pdf_text' && !isKakuziHtml)
                        throw new Error('OCR or unknown non-native extraction requires visual review');
                    if (row.method === 'native_pdf_text' && row.needs_review === true)
                        throw new Error('Incomplete native PDF extraction requires review; not eligible for automatic publication');
                    const url = new URL(row.document_url);
                    if (url.protocol !== 'https:' || url.username || url.password)
                        throw new Error('Registered HTTPS provenance required');
                    const host = url.hostname.replace(/^www\./, '');
                    if (isKakuziHtml && (host !== 'kakuzi.co.ke' || url.pathname !== '/five-year-record' || url.search || url.hash))
                        throw new Error('Exact registered Kakuzi record URL required');
                    if (row.source_id === 'cbk-bond-history') {
                        if (!/^RESULTS FOR REOPENED\b/i.test(row.text.trim()) || !/Director,?\s+Financial Markets/i.test(row.text))
                            throw new Error('Unsupported CBK signed-results layout');
                        const records = draftCbkBondReport(row.text, row.document_url);
                        for (const record of records) {
                            if (record.payload.coupon == null || !record.payload.price || record.payload.yield <= 0 || record.payload.yield > 100 || record.payload.coupon > 100 || record.payload.price > 300 || record.payload.tenor > 50 || record.payload.maturity <= record.observedAt)
                                throw new Error('Bond range, maturity or required inputs failed');
                            const existing = (await db.query('SELECT source_url,payload FROM market.research_records WHERE id=$1 FOR UPDATE', [record.id])).rows[0];
                            if (existing && (existing.source_url !== record.sourceUrl || Object.entries(record.payload).some(([key, v]) => existing.payload[key] !== v)))
                                throw new Error('Existing bond observation conflicts; review required');
                        }
                        for (const record of records)
                            await db.query(`INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(id) DO NOTHING`, [record.id, record.kind, record.title, record.symbol, record.observedAt, record.sourceUrl, JSON.stringify(record.payload)]);
                        result = { recordIds: records.map(r => r.id) };
                    }
                    else {
                        const domains = (row.config?.allowedDomains ?? []);
                        if (row.source_id === 'nse' ? host !== 'nse.co.ke' : row.source_id === 'kenyanstocks' ? host !== 'assets.kenyanstocks.com' : !domains.some(domain => host === domain.replace(/^www\./, '')))
                            throw new Error('Source host outside registered issuer archive');
                        // Exact full issuer name in the report header, not fuzzy title matching.
                        const names = (await db.query(`SELECT s.id,s.company_id,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.exchange='NSE' AND s.status='active' AND (lower(c.name) NOT LIKE 'safaricom%' OR s.symbol='SCOM')`)).rows;
                        const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const header = normalize(row.text.slice(0, 4000));
                        const explicitSafaricom = /^\s*SAFARICOM\s+PLC\s+CONDENSED AUDITED RESULTS FOR THE\s*$/im.test(row.text) || /SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016/i.test(row.text);
                        const explicitKakuzi = /^\s*KAKUZI PLC\s*$/im.test(row.text) && /ANNOUNCEMENT OF GROUP RESULTS FOR THE YEAR ENDED\s+31 DECEMBER 2017/i.test(row.text);
                        const explicitKcb = /KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES/.test(row.text) && /FOR THE YEAR ENDED 31ST DECEMBER 2017/.test(row.text);
                        // A verified statement masthead takes precedence over incidental
                        // issuer names in commentary or shareholder disclosures.
                        const mastheads = names.filter(c => issuerMastheadMatches(row.text, c.name));
                        const matches = names.filter(c => isKakuziHtml ? c.id === 'NSE:KUKZ' : explicitSafaricom ? c.id === 'NSE:SCOM' : explicitKakuzi ? normalize(c.name) === 'kakuziplc' : explicitKcb ? c.id === 'NSE:KCB' : mastheads.length ? mastheads.some(m => m.id === c.id) : header.includes(normalize(c.name)));
                        if (matches.length !== 1)
                            throw new Error('Unique exact issuer identity required');
                        const issuer = matches[0];
                        const entries = isKakuziHtml ? validateKakuziHtmlRecord(row.text, row.tables, issuer.id, new Date(row.extracted_at).toISOString().slice(0, 10)) : explicitKcb ? validateKcbGroupReport(row.text, issuer.id) : explicitKakuzi ? validateKakuziGroupReport(row.text, issuer.id) : issuer.id === 'NSE:SCOM' && /CONDENSED AUDITED RESULTS FOR THE/.test(row.text)
                            ? validateCondensedGroupReport(row.text, issuer.name, issuer.id)
                            : issuer.id === 'NSE:SCOM' && /SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016/i.test(row.text)
                                ? validateSafaricomPressReport(row.text, new Date(row.extracted_at).toISOString().slice(0, 10))
                                : validateNativeAnnualReport(row.text, issuer.name, issuer.id);
                        const ids = [];
                        for (const [index, entry] of entries.entries()) {
                            const tableIndex = 100000 + index; // separate from heuristic/manual table indexes
                            const existing = (await db.query('SELECT id::text,status FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2', [row.id, tableIndex])).rows[0];
                            if (existing?.status === 'confirmed') {
                                ids.push(existing.id);
                                continue;
                            }
                            if (existing?.status === 'rejected')
                                throw new Error('Previously rejected auto candidate requires review');
                            await financialStatementCandidatesRepository.upsert({ companyId: issuer.company_id, securityId: issuer.id, rawCompanyName: issuer.name,
                                source: row.source_id, exchange: 'NSE', documentUrl: row.document_url, documentTitle: row.title, tableIndex,
                                detectedTable: entry.table, detectionConfidence: 1, scrapedArtifactId: row.artifact_id, scrapedExtractionId: row.id }, db);
                            const candidate = (await db.query('SELECT id::text FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2', [row.id, tableIndex])).rows[0];
                            await confirmHistoricalColumns(candidate.id, entry.confirmation, db);
                            ids.push(candidate.id);
                        }
                        // Commit the refresh request with the canonical figures. A
                        // process restart after COMMIT must not lose chart/research work.
                        result = { candidateIds: ids, securityId: issuer.id, symbol: issuer.id.slice(4), researchRefreshPending: true };
                    }
                    outcome = 'published';
                    reason = 'Registered source template and accounting checks passed; canonical records published without restatement';
                }
                catch (error) {
                    await db.query('ROLLBACK TO SAVEPOINT canonical_publication');
                    reason = error instanceof Error ? error.message.slice(0, 400) : 'Validation requires review';
                }
                await db.query(`INSERT INTO market.document_validations(extraction_id,validator_version,artifact_sha256,source_url,outcome,reason,result)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [row.id, DOCUMENT_VALIDATOR_VERSION, row.sha256, row.document_url, outcome, reason, JSON.stringify(result)]);
                summary[outcome]++;
            });
        }
        catch (err) {
            summary.failed++;
            logger.warn({ extractionId: row.id, error: String(err) }, 'Document publication transaction failed; record remains retryable');
        }
    }
    await drainDocumentResearchRefresh();
    logger.info(summary, 'Automatic document validation completed');
    return summary;
}

let refreshing;
export function drainDocumentResearchRefresh() {
    if (refreshing) return refreshing;
    refreshing = refreshPendingDocuments().finally(() => { refreshing = undefined; });
    return refreshing;
}
async function refreshPendingDocuments() {
    // Audit rows double as a durable outbox; no R2 objects pass through Render.
    // Claim and commit before research acquires its own database locks.
    const pending = await query(`WITH due AS (
      SELECT extraction_id,validator_version FROM market.document_validations
      WHERE outcome='published' AND result->>'researchRefreshPending'='true'
      AND (result->>'researchRefreshAfter' IS NULL OR (result->>'researchRefreshAfter')::timestamptz<=now())
      ORDER BY (result->>'researchRefreshAfter')::timestamptz NULLS FIRST,extraction_id FOR UPDATE SKIP LOCKED LIMIT 5)
      UPDATE market.document_validations v SET result=v.result || jsonb_build_object('researchRefreshAfter',now()+interval '10 minutes')
      FROM due WHERE v.extraction_id=due.extraction_id AND v.validator_version=due.validator_version
      RETURNING v.extraction_id,v.validator_version,v.result`);
    // A published filing must refresh the same research used by the app and
    // portfolio Engine, not wait for the unrelated daily quote worker.
    for (const row of pending.rows) {
        const { securityId: id, symbol } = row.result ?? {};
        try {
            if (!/^NSE:[A-Z0-9-]{1,20}$/.test(id) || id !== `NSE:${symbol}`)
                throw new Error('Invalid refresh issuer');
            await Promise.all(['annual', 'quarterly'].flatMap(period => [
                cache.del(`financial-read:latest:NSE:${symbol}:${period}`),
                ...Array.from({ length: 50 }, (_, index) => cache.del(`financial-read:history:NSE:${symbol}:${period}:${index + 1}`)),
            ]));
            await cache.del(engineCacheKeys.bundle('NSE', symbol));
            await cache.del(engineCacheKeys.lastGood('NSE', symbol));
            const quote = await pricesRepository.getQuote(id);
            if (!quote || !await researchService.recomputeAndStore(id, quote.lastPrice))
                throw new Error('Research inputs unavailable; durable retry retained');
            await cache.del(CacheKeys.ratios('NSE', symbol));
            await cache.del(CacheKeys.afriScore('NSE', symbol));
            await cache.del(`engine:v3:NSE:${symbol}`);
            await cache.del(engineCacheKeys.bundle('NSE', symbol));
            await cache.del(engineCacheKeys.lastGood('NSE', symbol));
            await query(`UPDATE market.document_validations SET result=result || '{"researchRefreshPending":false}'::jsonb
              WHERE extraction_id=$1 AND validator_version=$2`, [row.extraction_id, row.validator_version]);
        }
        catch (error) {
            logger.warn({ securityId: id, error: String(error) }, 'Published financials retained; research refresh will retry');
        }
    }
}
