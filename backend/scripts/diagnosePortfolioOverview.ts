import 'dotenv/config';
import {query,pool} from '../src/storage/db.js';
import {getPortfolioOverview} from '../src/services/research/engineWorkspace.js';
try{
 const accounts=await query<{user_id:string}>('SELECT DISTINCT user_id FROM public.portfolios LIMIT 3');
 for(const row of accounts.rows){const start=Date.now();try{const result=await getPortfolioOverview(row.user_id,'NSE');console.log(JSON.stringify({ok:true,ms:Date.now()-start,holdingCount:result.holdingCount,pricedCount:result.pricedCount}));}catch(e){console.log(JSON.stringify({ok:false,ms:Date.now()-start,code:(e as {code?:string}).code,message:(e as Error).message}));}}
}finally{await pool.end();}
