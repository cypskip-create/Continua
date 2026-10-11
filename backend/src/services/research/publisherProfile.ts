import {query} from '../../storage/db.js';
import {legalIssuerIdentity} from '../../ingestion/normalizers/issuerIdentity.js';
export async function publisherProfile(symbol:string,companyName:string) {
 const result=await query(`SELECT e.tables,a.document_url,a.retrieved_at FROM scraping.extractions e
  JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
  WHERE a.source_id='afx-company-history' AND s.enabled AND e.entity->>'ticker'=$1
  AND a.document_url=$2 AND a.sha256 ~ '^[a-f0-9]{64}$'
  ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1`,[symbol,`https://afx.kwayisi.org/nse/${symbol.toLowerCase()}.html`]);
 const row=result.rows[0],p=row?.tables?.find((p:any)=>p.kind==='publisher_profile');
 if(!p||legalIssuerIdentity(p.companyName)!==legalIssuerIdentity(companyName))return null;
 const facts=p.facts??{},website=typeof facts.website==='string'?facts.website:null;
 return {headquarters:typeof facts.address==='string'?facts.address:null,
  website:website&&/^(?:https?:\/\/)?[a-z0-9.-]+(?:\/[a-z0-9/_-]*)?$/i.test(website)?website:null,
  sourceUrl:row.document_url,observedAt:row.retrieved_at};
}
