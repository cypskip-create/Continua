import type { Candle } from "../../types/market.js";
export interface ExecutionOptions {feeBps:number;slippageBps:number;initialCapital:number;maxVolumeParticipation:number}
export function simulateExecution(bars:Candle[],signals:("buy"|"sell"|"hold")[],options:ExecutionOptions) {
  let cash=options.initialCapital,shares=0,entry:{date:string;price:number;cost:number}|null=null,peak=cash,drawdown=0,skipped=0;
  const trades:{entryDate:string;entryPrice:number;exitDate:string;exitPrice:number;returnPercent:number;holdingDays:number}[]=[];
  const equity:{date:string;value:number}[]=[];
  const fee=options.feeBps/10000,slippage=options.slippageBps/10000;
  for(let i=0;i<bars.length;i++){
    const bar=bars[i]!,signal=i>0?signals[i-1]:"hold";
    // Signals use the prior completed bar and execute at the next session's open.
    if(signal==="buy"&&shares===0&&bar.open>0){const price=bar.open*(1+slippage),quantity=cash/(price*(1+fee));
      if(bar.volume<=0||quantity>bar.volume*options.maxVolumeParticipation)skipped++;
      else{shares=quantity;entry={date:bar.timestamp,price,cost:cash};cash=0;}
    }else if(signal==="sell"&&entry&&shares>0){
      if(bar.volume<=0||shares>bar.volume*options.maxVolumeParticipation)skipped++;
      else{const price=bar.open*(1-slippage);cash=shares*price*(1-fee);trades.push({entryDate:entry.date,entryPrice:entry.price,exitDate:bar.timestamp,exitPrice:price,returnPercent:(cash/entry.cost-1)*100,holdingDays:Math.round((Date.parse(bar.timestamp)-Date.parse(entry.date))/86400000)});entry=null;shares=0;}
    }
    const value=cash+shares*bar.close;peak=Math.max(peak,value);drawdown=Math.max(drawdown,peak>0?(peak-value)/peak:0);equity.push({date:bar.timestamp,value});
  }
  return {trades,equity,skipped,openPosition:shares>0,totalReturnPercent:equity.length?(equity[equity.length-1]!.value/options.initialCapital-1)*100:0,maxDrawdownPercent:drawdown*100};
}
