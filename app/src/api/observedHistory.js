import {historicalApi} from './historicalApi';
import {normalizePriceHistory,priceWindow} from '@/lib/priceHistory';

/** Shared by stock and portfolio charts: use real candles or reported closes. */
export async function observedHistory(symbol,timeframe){
 const window=priceWindow(timeframe);
 const results=await Promise.allSettled([
  historicalApi.getCandles(symbol,{interval:'1d',from:window.from,to:window.to+'T23:59:59.999Z'}),
  historicalApi.getCloses(symbol,window)
 ]);
 if(results.every(result=>result.status==='rejected'))throw results[0].reason;
 return normalizePriceHistory(results[0].status==='fulfilled'?results[0].value:[],results[1].status==='fulfilled'?results[1].value:[],timeframe);
}
