/** Presentation validation only. The Python model validates every calculation. */
export function investmentConfiguration(value:unknown,tool:string){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Import a configuration object.');
 const input=value as Record<string,unknown>;
 if(tool==='Backtesting'){
  if(input.kind!=='backtest'||typeof input.start!=='string'||typeof input.end!=='string'||typeof input.capital!=='number'||!Number.isFinite(input.capital)||input.capital<=0||typeof input.currency!=='string'||!Array.isArray(input.assets))throw new Error('A backtest snapshot requires explicit dates, currency, positive capital and a sourced asset basket.');
  return {configuration:input,capital:input.capital,start:input.start,end:input.end,basket:(input.assets as {symbol:string}[]).map(asset=>asset.symbol).join(', '),frequency:String(input.rebalance??'none'),costBps:Number(input.costBps??0),objective:undefined,cashMaximum:undefined,turnover:undefined};
 }
 if(tool==='Optimization'){
  if(input.kind&&input.kind!=='optimization')throw new Error('Import optimization constraints for this view.');
  const configuration=Object.fromEntries(['minimum','maximum','excluded','sectorLimits'].filter(key=>key in input).map(key=>[key,input[key]]));
  return {configuration,capital:undefined,start:undefined,end:undefined,basket:undefined,frequency:undefined,costBps:undefined,objective:input.objective==null?undefined:String(input.objective),cashMaximum:input.cashMaximum==null?undefined:Number(input.cashMaximum)*100,turnover:input.turnoverCap==null?undefined:Number(input.turnoverCap)*100};
 }
 if(input.kind!=='factors'||!Array.isArray(input.observations))throw new Error('Import a sourced factor-descriptor snapshot here; return-factor models have their own research panel.');
 return {configuration:input,capital:undefined,start:undefined,end:undefined,basket:undefined,frequency:undefined,costBps:undefined,objective:undefined,cashMaximum:undefined,turnover:undefined};
}
