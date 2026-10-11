/** Read-only report of source-backed publication and outstanding validation. */
import {pool,query} from '../src/storage/db.js';
import {financialsRepository} from '../src/storage/repositories/financialsRepository.js';
import {corporateActionsRepository} from '../src/storage/repositories/corporateActionsRepository.js';
try {
 console.log(JSON.stringify({earnings:await corporateActionsRepository.getEarningsBySecurity('NSE:SCOM',3)},null,2));
 console.log(JSON.stringify({history:(await financialsRepository.getHistoricalPeriods('NSE:SCOM','annual',20)).map(row=>({year:row.fiscalYear,revenue:row.revenue,eps:row.eps,freeCashFlow:row.freeCashFlow,sourceUrls:row.sourceUrls})),validation:(await query(`SELECT extraction_id,validator_version,outcome,reason FROM market.document_validations WHERE extraction_id IN (136,5095) ORDER BY validated_at DESC LIMIT 4`)).rows,identity:(await query("SELECT s.id,s.symbol,s.status,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE lower(c.name) LIKE '%safaricom%'")).rows},null,2));
}catch(e){console.error((e as Error).message);process.exitCode=1;}finally{await pool.end();}
