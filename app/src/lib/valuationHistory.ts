/** One observed close per date. Intraday duplicates must not create a sawtooth
 * valuation line at the same x coordinate. Missing days are never generated. */
export function dailyValuationCloses<T extends {timestamp:string;close:number}>(candles:T[]):T[] {
  const daily=new Map<string,T>();
  for(const candle of [...candles].sort((a,b)=>a.timestamp.localeCompare(b.timestamp))) {
    if(!Number.isFinite(Date.parse(candle.timestamp)) || !Number.isFinite(candle.close) || candle.close<=0)continue;
    daily.set(candle.timestamp.slice(0,10),candle);
  }
  return [...daily.values()];
}
