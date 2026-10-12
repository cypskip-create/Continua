import {expect,it} from 'vitest';
import {AdvancedResearchSchema,advancedResearch} from '../src/services/research/advancedResearch.js';
import {factorResearch} from '../src/services/research/factorResearch.js';
const now=new Date('2026-10-12T00:00:00Z'),sourceUrl='https://issuer.example/reports';
const points=Array.from({length:201},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close:100*Math.exp(i*.001+.01*Math.sin(i))}));
it('adjusts a verified split and dividend without inventing gap prices',()=>{
 const input=AdvancedResearchSchema.parse({kind:'total-return',sourceUrl,points:[{date:'2025-01-01',close:100},{date:'2025-01-02',close:50},{date:'2025-01-03',close:51}],actions:[{date:'2025-01-02',splitRatio:2,sourceUrl},{date:'2025-01-03',dividend:1,sourceUrl}],actionCoverageConfirmed:true});
 if(input.kind!=='total-return')throw new Error('Unexpected test input');
 const r=advancedResearch(input,now);expect('totalReturnPercent' in r&&r.totalReturnPercent).toBeCloseTo(4);
 expect(()=>advancedResearch({...input,points:[{date:'2025-01-01',close:100},{date:'2025-01-03',close:51}]},now)).toThrow(/action date/);
});
it('keeps benchmark dates and basis explicit and rejects sparse intervals',()=>{
 const r=advancedResearch({kind:'benchmark',sourceUrl,benchmarkSourceUrl:sourceUrl,basis:'price',points,benchmark:points},now);
 expect('trackingErrorPercent' in r&&r.trackingErrorPercent).toBe(0);expect('informationRatio' in r&&r.informationRatio).toBeNull();
 expect(()=>advancedResearch({kind:'benchmark',sourceUrl,benchmarkSourceUrl:sourceUrl,basis:'price',points,benchmark:points.slice(1)},now)).toThrow(/identical/);
});
it('reproduces seeded block-bootstrap output and bounds its workload',()=>{
 const input={kind:'bootstrap' as const,sourceUrl,points,paths:100,horizon:20,seed:42,blockSize:5};
 expect(advancedResearch(input,now)).toEqual(advancedResearch(input,now));
 expect(AdvancedResearchSchema.safeParse({...input,paths:10000}).success).toBe(false);
 expect(()=>advancedResearch({...input,points:points.slice(0,20)},now)).toThrow(/120/);
});
it('replays only observed endpoints and keeps cross-asset currencies/dates compatible',()=>{
 const r=advancedResearch({kind:'replay',sourceUrl,points,start:points[0]!.date,end:points[20]!.date},now);expect('curve' in r&&r.curve.length).toBe(21);
 const positions=[{name:'Cash',assetClass:'cash' as const,value:100,asOf:'2025-01-01',sourceUrl},{name:'Bond',assetClass:'bond' as const,value:100,asOf:'2025-01-02',sourceUrl}];
 expect(()=>advancedResearch({kind:'cross-asset',currency:'KES',positions},now)).toThrow(/common valuation/);
 expect(AdvancedResearchSchema.safeParse({kind:'cross-asset',currency:'USD',positions}).success).toBe(false);
});
it('fits factors on training data only and reports holdout failures',()=>{
 const data=points.map((p,i)=>({date:p.date,portfolioReturn:(i<134?2:4)*(.01*Math.sin(i)),factors:{market:.01*Math.sin(i)}}));
 const r=factorResearch(data);expect(r.exposures[0]!.beta).toBeCloseTo(2);expect(r.holdoutObservations).toBe(67);expect(r.holdoutRmsePercent).toBeGreaterThan(1);
 expect(()=>factorResearch(data.map(p=>({...p,factors:{a:1,b:1}})))).toThrow(/singular/);
});
it('rejects future dates, duplicate observations and unsupported request fields',()=>{
 expect(()=>advancedResearch({kind:'replay',sourceUrl,points:[...points,points[0]!],start:points[0]!.date,end:points[20]!.date},now)).toThrow(/Duplicate/);
 expect(AdvancedResearchSchema.safeParse({kind:'replay',sourceUrl,points,start:'2025-02-30',end:'2025-03-01'}).success).toBe(false);
 expect(AdvancedResearchSchema.safeParse({kind:'replay',sourceUrl,points,start:'2025-01-01',end:'2025-03-01',userId:'forged'}).success).toBe(false);
});
