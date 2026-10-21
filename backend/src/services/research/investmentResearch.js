import { query } from '../../storage/db.js';
import { pythonCalculation } from './pythonCalculations.js';
import { ApiError } from '../../api/middleware/errorHandler.js';

export async function investmentEvidence(kind, asOf, symbol) {
    if(kind==='event') return (await query('SELECT payload FROM market.investment_event_rows($1::date,$2) payload',[asOf,symbol??null])).rows.map(r=>r.payload);
    const rows = await query(`SELECT DISTINCT ON(natural_key,observed_date) id,natural_key,observed_date::text AS date,
      available_date::text AS "availableAt",payload,source_url AS "sourceUrl",retrieved_at AS "retrievedAt",sha256
      FROM market.investment_evidence WHERE kind=$1 AND available_date<=$2::date
      AND ($3::text IS NULL OR security_id=$3) ORDER BY natural_key,observed_date,available_date DESC,ingested_at DESC,id DESC LIMIT 5000`,
      [kind,asOf,symbol ? 'NSE:'+symbol : null]);
    return rows.rows.map(r=>({...r.payload,id:r.id,date:r.date,availableAt:r.availableAt,sourceUrl:r.sourceUrl,retrievedAt:r.retrievedAt,sha256:r.sha256}));
}
export async function calculateInvestment(input) {
    const result = await pythonCalculation('investment_research',[input]);
    if(result.status!==200) throw new ApiError(422,result.error??'Research inputs require review.');
    return result.data;
}
