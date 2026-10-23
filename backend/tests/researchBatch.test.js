import {it,expect} from 'vitest';
import {researchBatch} from '../src/api/controllers/researchBatch.js';
it('bounds concurrency, deduplicates symbols and preserves other companies when one is unavailable',async()=>{
 let active=0,maximum=0,output;const calls=[];
 await researchBatch({query:{symbols:'KCB,EQTY,KCB,ABSA',exchange:'NSE'}},{json:value=>{output=value.data;}},async(req,res)=>{calls.push(req.params.symbol);active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(req.params.symbol==='EQTY')throw Error('missing');res.json({data:{symbol:req.params.symbol}});});
 expect(maximum).toBeLessThanOrEqual(2);expect(calls).toHaveLength(3);expect(output.items.KCB.symbol).toBe('KCB');expect(output.items.EQTY).toBeNull();expect(output.unavailable).toEqual(['EQTY']);
});
it('rejects invalid or oversized batches before calling a company service',async()=>{
 for(const symbols of ['', '../admin',Array.from({length:21},(_,index)=>'S'+index).join(',')]){let calls=0;await expect(researchBatch({query:{symbols}},{json:()=>{}},async()=>{calls++;})).rejects.toMatchObject({status:400});expect(calls).toBe(0);}
});
