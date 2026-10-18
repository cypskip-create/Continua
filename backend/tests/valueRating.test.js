import {it,expect,vi} from 'vitest';
import {pythonCalculation} from '../src/services/research/pythonCalculations.js';
import {MyStocksClient,parseMarketCapMillions} from '../src/adapters/mystocks/mystocksClient.js';
import {parseAfxQuote,parseAfxDailyHistory} from '../src/adapters/afx/afxRawParser.js';
const now='2026-10-18T12:00:00Z';
const input=(values,priceAsOf=now)=>({currentPrice:50,priceAsOf,models:values.map(fairValue=>({model:'Fixture',fairValue,currentPrice:50}))});
it('withholds stars for sparse, stale, future or contradictory model evidence',async()=>{
 for(const v of [input([60]),input([10,60,100]),input([60,62],'2026-10-01T12:00:00Z'),input([60,62],'2026-10-19T12:00:00Z')]){
  const r=await pythonCalculation('value_rating',[v,now]);expect(r.stars).toBeNull();expect(r.unavailableReason).toBeTruthy();
 }
});
it('uses symmetric documented thresholds and excludes nonpositive/price-mismatched models',async()=>{
 for(const [fair,stars]of [[65,5],[55,4],[45,2],[35,1],[50,3]])expect((await pythonCalculation('value_rating',[input([fair,fair]),now])).stars).toBe(stars);
 const v=input([60,62,0,-10]);v.models.push({model:'Old',fairValue:900,currentPrice:10});
 const r=await pythonCalculation('value_rating',[v,now]);expect(r.fair).toBe(61);expect(r.excluded).toBe(3);expect(r.stars).toBe(4);
});
it('converts observed market-cap units exactly once and preserves missing data',()=>{
 expect(parseMarketCapMillions('222.66B')).toBe(222660);expect(parseMarketCapMillions('842M')).toBe(842);
 expect(parseMarketCapMillions('1,000,000')).toBe(1);expect(parseMarketCapMillions('unknown')).toBeUndefined();
 expect(parseMarketCapMillions('0')).toBeUndefined();
});
it('withholds incomplete observed quotes instead of replacing absent fields with zeros',async()=>{
 const data=['37.60','0.25','37.85','','37.70','37.95','37.50','516,703','','','222.66B'];
 const request=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({stamp:Math.floor(Date.now()/1000),data}),{status:200}));
 try{
  const client=new MyStocksClient();const valid=await client.fetchQuotes(['FIXTUREVALID']);expect(valid[0].MarketCapMn).toBe(222660);expect(valid[0].Volume).toBe(516703);
  data[7]='';expect(await client.fetchQuotes(['FIXTUREMISSING'])).toEqual([]);
 }finally{request.mockRestore();}
});
it('parses volume as shares in both AFX tables, keeping zero distinct from missing',()=>{
 const html='<body><table><tr><td>Traded Volume</td><td>40.1M</td></tr></table><table><tr><th>Date</th><th>Volume</th><th>Close</th></tr><tr><td>2026-10-15</td><td>4.2K</td><td>20</td></tr><tr><td>2026-10-16</td><td>0</td><td>21</td></tr></table></body>';
 expect(parseAfxQuote(html,'FIXTURE').volume).toBe(40100000);expect(parseAfxDailyHistory(html).map(r=>r.volume)).toEqual([4200,0]);
 expect(parseAfxQuote('<body></body>','FIXTURE').volume).toBeNull();
});
