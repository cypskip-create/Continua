import {describe,it,expect} from 'vitest';
import {researchReadiness} from '../src/services/research/researchReadiness.js';
const now=new Date('2026-10-11T12:00:00Z');
const row=(year:number)=>({fiscalYear:year,periodEnd:`${year}-12-31`,reportedAt:`${year+1}-03-01`,eps:6,revenue:100,netIncome:20,sourceUrls:['https://issuer.co.ke/report.pdf']});
const base={quote:{lastPrice:90,timestamp:'2026-10-09T12:00:00Z',source:'live'},history:[row(2024),row(2025)],unavailable:[],technicalObservations:100,estimateCount:1,ownershipCount:2};
describe('evidence readiness',()=>{
 it('has deterministic IDs independent of retrieval time',()=>{const a=researchReadiness(base,now),b=researchReadiness(base,new Date('2026-10-12'));expect(a.snapshotId).toBe(b.snapshotId);expect(a.status).toBe('supported');expect(researchReadiness({...base,quote:{...base.quote,lastPrice:91}},now).snapshotId).not.toBe(a.snapshotId);});
 it('reports gaps, missing estimates and stale evidence separately',()=>{const r=researchReadiness({...base,history:[row(2017),row(2024)],estimateCount:0},now);expect(r.gaps).toContain(2020);expect(r.capabilities.find(c=>c.id==='growth')?.status).toBe('unavailable');expect(r.capabilities.find(c=>c.id==='estimates')?.status).toBe('unavailable');});
 it('fails closed for future, mock and untraceable inputs',()=>{const r=researchReadiness({...base,quote:{...base.quote,source:'mock'},history:[{...row(2026),sourceUrls:[]}]},now);expect(r.status).toBe('incomplete');expect(r.matrix[0]?.usable).toBe(false);expect(r.issues.map(i=>i.id)).toContain('quote-unusable');});
 it('does not treat zero or missing figures as equivalent',()=>{const r=researchReadiness({...base,history:[{...row(2025),revenue:0,eps:undefined}]},now);expect(r.matrix[0]?.fields.revenue).toBe(true);expect(r.matrix[0]?.fields.eps).toBe(false);});
});
