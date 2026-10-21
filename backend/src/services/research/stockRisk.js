import {createHash} from 'node:crypto';
import {getEngineBundle} from './engineBundle.js';
import {candlesRepository} from '../../storage/repositories/candlesRepository.js';
import {corporateActionsRepository} from '../../storage/repositories/corporateActionsRepository.js';
import {securitiesRepository} from '../../storage/repositories/securitiesRepository.js';
import {cache} from '../../storage/cache.js';
import {pythonCalculation} from './pythonCalculations.js';
import {ApiError} from '../../api/middleware/errorHandler.js';

/** Quote revisions invalidate this public issuer-history cache. Corrections
 * without a new quote expire within 30 seconds. No owned portfolio is cached.
 */
export async function riskHistory(securityId, quoteAsOf, lookbackDays=365) {
    const revision=createHash('sha256').update(String(quoteAsOf)).digest('hex');
    return cache.getOrSet(`risk-history:v2:${securityId}:${revision}:${lookbackDays}`,30_000,async()=>{
        const now=new Date(),from=new Date(now.getTime()-lookbackDays*86400000).toISOString();
        const [bars,actions]=await Promise.all([candlesRepository.getCandles(securityId,'1d',from,now.toISOString()),corporateActionsRepository.getBySecurity(securityId)]);
        return {bars:bars.map(b=>({timestamp:b.timestamp,close:b.close,volume:b.volume,sourceUrl:b.sourceUrl})),actions};
    });
}
export async function getStockRisk(symbol) {
    const instruments=await securitiesRepository.listInstruments('NSE');
    const instrument=instruments.find(i=>i.symbol===symbol);
    if(!instrument)throw new ApiError(404,'Unknown stock');
    const bundle=await getEngineBundle(symbol,'NSE');
    const {bars,actions}=await riskHistory(instrument.securityId,bundle.quote?.timestamp,400);
    return pythonCalculation('stock_risk',[{symbol:bundle.symbol,currency:bundle.currency,sector:instrument.sector,quote:bundle.quote},bars,actions,new Date().toISOString()]);
}
