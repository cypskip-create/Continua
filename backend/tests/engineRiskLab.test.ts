import {expect,it} from 'vitest';
import {stressPortfolio,riskContributions,bondRisk,futuresRisk,totalReturnSeries} from '../src/services/research/engineRiskLab.js';
it('reconciles sector and holding stress P/L with compounded assumptions',()=>{
 const r=stressPortfolio([{symbol:'A',sector:'Banks',value:100},{symbol:'B',sector:'Energy',value:300}],-.1,{Banks:-.2});
 expect(r.pnl).toBeCloseTo(-58);expect(r.stressedValue).toBeCloseTo(342);expect(r.contributions.reduce((s,p)=>s+p.pnl,0)).toBeCloseTo(r.pnl);
});
it('risk shares reconcile and sparse VaR stays unavailable',()=>{
 const a=Array.from({length:80},(_,i)=>Math.sin(i)*.01),b=a.map(n=>n*2);
 const r=riskContributions({A:a,B:b},{A:.5,B:.5})!;
 expect(r.contributions.reduce((s,p)=>s+p.riskShare,0)).toBeCloseTo(1);
 expect(r.contributions[1]!.riskShare).toBeCloseTo(2/3);expect(r.tailObservations).toBe(4);
 expect(r.expectedShortfall95!).toBeGreaterThanOrEqual(r.historicalVaR95!);
 expect(riskContributions({A:a.slice(0,20)},{A:1})!.historicalVaR95).toBeNull();
});
it('prices a zero coupon independently and reconciles clean + accrued = dirty',()=>{
 const r=bondRisk({settlement:'2025-01-01',previousCoupon:'2025-01-01',nextCoupon:'2026-01-01',couponPerPeriod:0,yieldPercent:10,frequency:1,cashFlows:[{date:'2026-01-01',amount:100}],shockBps:100});
 expect(r.dirtyPrice).toBeCloseTo(100/1.1,8);expect(r.modifiedDuration).toBeCloseTo(1/1.1,6);expect(r.convexity).toBeCloseTo(2/1.1**2,5);expect(r.stressedDirtyPrice).toBeCloseTo(100/1.11,8);
 expect(r.cleanPrice+r.accruedInterest).toBeCloseTo(r.dirtyPrice);
});
it('futures use the contract multiplier and reverse direction for a short',()=>{
 const input={entry:100,settlement:105,multiplier:10,contracts:2,side:'long' as const,margin:200,expiry:'2026-12-01',asOf:'2026-10-11',shockPercent:-10};
 expect(futuresRisk(input).pnl).toBe(100);expect(futuresRisk({...input,side:'short'}).pnl).toBe(-100);
 expect(futuresRisk(input).stressedMarginBalance).toBe(90);
});
it('verified split adjustment preserves wealth and cash dividends enter total return',()=>{
 const p=[{date:'2025-01-01',close:100},{date:'2025-01-02',close:50},{date:'2025-01-03',close:51}];
 const r=totalReturnSeries(p,[{date:'2025-01-02',splitRatio:2,sourceUrl:'https://www.nse.co.ke/a.pdf'},{date:'2025-01-03',dividend:1,sourceUrl:'https://www.nse.co.ke/b.pdf'}]);
 expect(r[1]!.index).toBe(100);expect(r[2]!.index).toBe(104);
 expect(()=>totalReturnSeries([p[0]!,p[2]!],[{date:'2025-01-02',splitRatio:2,sourceUrl:'https://www.nse.co.ke/a.pdf'}])).toThrow('gap');
});
it('rejects ambiguous combined actions and missing provenance',()=>{
 const points=[{date:'2025-01-01',close:100},{date:'2025-01-02',close:50}];
 expect(()=>totalReturnSeries(points,[{date:'2025-01-02',splitRatio:2,dividend:1,sourceUrl:'https://www.nse.co.ke/a.pdf'}])).toThrow('per-share basis');
 expect(()=>totalReturnSeries(points,[{date:'2025-01-02',dividend:1,sourceUrl:'x'}])).toThrow('source-backed');
});
it('does not emit non-finite or flat variance attribution',()=>{
 expect(riskContributions({A:Array(80).fill(0)},{A:1})).toBeNull();
 expect(riskContributions({A:Array(80).fill(.01)},{A:Infinity})).toBeNull();
});
