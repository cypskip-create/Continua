import { query } from '../../storage/db.js';
import {processedObjectRepository} from '../../storage/researchObjects.js';

export const collectedResearchRepository = { get: (...args) => collectedResearch(...args) };

/** Read already processed observations, never fetch/decode private R2 files.
 * Recheck rights on every read. Unknown/OCR documents stay review-labelled and
 * must not be fed to valuation or overwrite canonical statement periods.
 */
export const researchDestinations = new Set(['financials','overview','ownership','statistics','news','corporateActions','history','documents','additionalResearch']);
export async function collectedResearch(symbol, limit = 20, offset = 0, destinations = []) {
    if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) return [];
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000)
        throw new Error('Invalid collected research page');
    if (!Array.isArray(destinations) || destinations.length > 9 || destinations.some(d=>!researchDestinations.has(d))) throw new Error('Invalid research destinations');
    const filter=destinations.length?'AND p.destination=ANY($4::text[])':'';
    const cloudMode=process.env.PROCESSED_STORAGE_READS??'database';
    if(!['database','prefer-r2','r2'].includes(cloudMode))throw new Error('Invalid processed storage mode');
    const cloud=cloudMode!=='database';
    const result = await query(`SELECT payload ${cloud?',extraction_id,processor_version,security_id,destination,status,object_uri,sha256,size_bytes':''} FROM (
      SELECT DISTINCT ON (p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END)
        p.payload,e.extracted_at,e.id ${cloud?',p.extraction_id,p.processor_version,p.security_id,p.destination,p.status,c.object_uri,c.sha256,c.size_bytes':''}
      FROM scraping.processed_research p JOIN scraping.extractions e ON e.id=p.extraction_id
      ${cloud?'LEFT JOIN scraping.processed_cloud_archive c ON c.extraction_id=p.extraction_id AND c.processor_version=p.processor_version AND c.processed_at=p.processed_at':''}
      JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
      WHERE p.security_id=$1 AND p.processor_version='collected-research-v1'
        ${filter}
        AND p.status IN ('publisher_observation','review_required','empty')
        AND p.destination<>'review' AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.storage_path LIKE 'r2://continua-financial-documents/%'
        AND a.sha256 ~ '^[a-f0-9]{64}$'
      ORDER BY p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END,e.extracted_at DESC,e.id DESC
    ) latest ORDER BY extracted_at DESC,id DESC LIMIT $2 OFFSET $3`, [`NSE:${symbol}`, limit, offset, ...(destinations.length?[destinations]:[])]);
    if (Buffer.byteLength(JSON.stringify(result.rows)) > 8 * 1024 * 1024)
        throw new Error('Collected research response too large; request a smaller page');
    if(!cloud)return result.rows.map(r => r.payload);
    const payloads=[],signal=AbortSignal.timeout(25000);let size=0;
    for(const row of result.rows) {
        if(!row.object_uri&&cloudMode==='r2')throw new Error('Processed cloud object is pending');
        const payload=row.object_uri?await processedObjectRepository.read(row,row,signal):row.payload;
        size+=Buffer.byteLength(JSON.stringify(payload));
        if(size>8*1024*1024)throw new Error('Collected research response too large; request a smaller page');
        payloads.push(payload);
    }
    return payloads;
}
