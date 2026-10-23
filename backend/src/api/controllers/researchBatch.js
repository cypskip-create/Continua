import {ApiError} from '../middleware/errorHandler.js';
/** Bound the request and CPU fan-out; one missing company does not hide others. */
export async function researchBatch(req,res,controller){
 const symbols=String(req.query.symbols??'').split(',').map(value=>value.trim().toUpperCase());
 const exchange=req.query.exchange??'NSE';
 if(exchange!=='NSE'||symbols.length<1||symbols.length>20||symbols.some(value=>! /^[A-Z0-9.-]{1,20}$/.test(value))||Object.keys(req.query).some(key=>!['exchange','symbols'].includes(key)))throw new ApiError(400,'Choose between 1 and 20 NSE symbols.');
 const unique=[...new Set(symbols)],items={},unavailable=[];let next=0;
 await Promise.all(Array.from({length:Math.min(2,unique.length)},async()=>{
  while(next<unique.length){const symbol=unique[next++];let output;
   try{await controller({params:{symbol},validatedQuery:{exchange}},{json:value=>{output=value.data;}});items[symbol]=output??null;}
   catch{items[symbol]=null;unavailable.push(symbol);}
  }
 }));
 res.json({data:{items,unavailable}});
}
