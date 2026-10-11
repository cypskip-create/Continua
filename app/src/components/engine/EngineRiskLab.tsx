import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {engineWorkspaceApi,type StressResult,type BondResult,type FuturesResult} from '@/api/engineWorkspaceApi';
import {ToolHelp} from '@/components/shared/ToolHelp';
import {ExportResearch} from './EngineResearchTools';
type LabResult=(StressResult|BondResult|FuturesResult)&{assumptions?:unknown;generatedAt?:string};

const number=(v:number|null)=>v==null?'Not available':v.toLocaleString(undefined,{maximumFractionDigits:4});
const field='rounded-xl border border-border bg-background px-3 py-2 w-full';
function ResultGrid({values}:{values:Record<string,number|null>}){return <dl className="grid grid-cols-2 gap-4">{Object.entries(values).map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{number(value)}</dd></div>)}</dl>}
function Input({label,value,onChange,type='number'}:{label:string;value:string|number;onChange:(v:string)=>void;type?:string}){return <label className="flex flex-col gap-1 text-sm"><span className="flex min-h-10 items-end">{label}</span><input required className={field} type={type} step="any" value={value} onChange={e=>onChange(e.target.value)}/></label>}
export function EngineRiskLab(){
 const [tab,setTab]=useState<'Portfolio stress'|'Bond cash flows'|'Futures exposure'>('Portfolio stress');
 const [shock,setShock]=useState('-10'),[sectors,setSectors]=useState('');
 const [bond,setBond]=useState({settlement:'',previousCoupon:'',nextCoupon:'',couponPerPeriod:'',yieldPercent:'',frequency:'2',shockBps:'100'});
 const [flows,setFlows]=useState('');
 const [future,setFuture]=useState({entry:'',settlement:'',multiplier:'',contracts:'1',margin:'',expiry:'',asOf:new Date().toISOString().slice(0,10),shockPercent:'-10',side:'long'});
 const mutation=useMutation<LabResult,Error,void>({mutationFn:async()=>{
  if(tab==='Portfolio stress'){
   const sectorShocks:Record<string,number>={};
   for(const line of sectors.split('\n').filter(v=>v.trim())){const parts=line.split(',');if(parts.length!==2||!parts[0]?.trim()||!parts[1]?.trim()||!Number.isFinite(Number(parts[1])))throw new Error('Enter one sector and percentage per line: Banking, -20');sectorShocks[parts[0].trim()]=Number(parts[1])/100;}
   return engineWorkspaceApi.stress({marketShock:Number(shock)/100,sectorShocks});
  }
  if(tab==='Bond cash flows'){
   const cashFlows=flows.split('\n').filter(v=>v.trim()).map(line=>{const parts=line.split(',');if(parts.length!==2||!parts[1]?.trim())throw new Error('Enter each payment as YYYY-MM-DD, amount');return {date:parts[0]!.trim(),amount:Number(parts[1])};});
   return engineWorkspaceApi.bond({...bond,couponPerPeriod:Number(bond.couponPerPeriod),yieldPercent:Number(bond.yieldPercent),frequency:Number(bond.frequency) as 1|2|4,shockBps:Number(bond.shockBps),cashFlows});
  }
  return engineWorkspaceApi.futures({...future,side:future.side as 'long'|'short',entry:Number(future.entry),settlement:Number(future.settlement),multiplier:Number(future.multiplier),contracts:Number(future.contracts),margin:Number(future.margin),shockPercent:Number(future.shockPercent)});
 }});
 const data=mutation.data;
 return <section className="space-y-5">
  <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Risk lab</h2><ToolHelp tool="Risk lab" description="Test a change before making a decision. These calculations use your holdings or the assumptions you enter; they do not predict the market or place trades."/></div>
  <p className="text-sm text-muted-foreground">Separate observed evidence from hypothetical outcomes. Every result shows its calculation basis.</p>
  <div className="flex gap-2 overflow-x-auto" role="tablist">{(['Portfolio stress','Bond cash flows','Futures exposure'] as const).map(t=><button key={t} disabled={mutation.isPending} role="tab" aria-selected={tab===t} onClick={()=>{setTab(t);mutation.reset()}} className={`shrink-0 rounded-full px-4 py-2 text-sm ${tab===t?'bg-primary text-primary-foreground':'bg-muted'}`}>{t}</button>)}</div>
  <form className="space-y-4" onSubmit={e=>{e.preventDefault();mutation.mutate()}}>
   {tab==='Portfolio stress'?<><Input label="Market price change (%)" value={shock} onChange={setShock}/><label className="block text-sm space-y-1">Additional sector changes (%) — optional<textarea className={field} rows={3} placeholder={'Banking, -20\nEnergy, 5'} value={sectors} onChange={e=>setSectors(e.target.value)}/></label><p className="text-xs text-muted-foreground">Uses your server-verified NSE holdings and dated quotes. Market and sector changes compound; this is not a beta or probability model.</p></>:
    tab==='Bond cash flows'?<><div className="grid grid-cols-2 gap-3">{(['settlement','previousCoupon','nextCoupon'] as const).map(key=><Input key={key} label={{settlement:'Settlement date',previousCoupon:'Previous coupon date',nextCoupon:'Next coupon date'}[key]} type="date" value={bond[key]} onChange={v=>setBond({...bond,[key]:v})}/>)}<Input label="Coupon payment per period" value={bond.couponPerPeriod} onChange={v=>setBond({...bond,couponPerPeriod:v})}/><Input label="Yield (%)" value={bond.yieldPercent} onChange={v=>setBond({...bond,yieldPercent:v})}/><Input label="Yield change (basis points)" value={bond.shockBps} onChange={v=>setBond({...bond,shockBps:v})}/><label className="text-sm">Payments per year<select className={field} value={bond.frequency} onChange={e=>setBond({...bond,frequency:e.target.value})}><option value="1">1</option><option value="2">2</option><option value="4">4</option></select></label></div><label className="block text-sm">Future payments: date, amount<textarea required className={field} rows={5} placeholder={'2027-03-15, 7\n2027-09-15, 107'} value={flows} onChange={e=>setFlows(e.target.value)}/></label><p className="text-xs text-muted-foreground">Enter the verified prospectus dates and all payments, including principal, on one consistent face amount. This is a manual cash-flow illustration, not a live bond quote.</p></>:
    <><div className="grid grid-cols-2 gap-3">{(['entry','settlement','multiplier','contracts','margin','expiry','asOf','shockPercent'] as const).map(key=><Input key={key} label={{entry:'Entry price',settlement:'Settlement price',multiplier:'Contract multiplier',contracts:'Number of contracts',margin:'Collateral deposited',expiry:'Contract expiry',asOf:'As-of date',shockPercent:'Price change (%)'}[key]} type={key==='expiry'||key==='asOf'?'date':'number'} value={future[key]} onChange={v=>setFuture({...future,[key]:v})}/>)}<label className="text-sm">Position<select className={field} value={future.side} onChange={e=>setFuture({...future,side:e.target.value})}><option value="long">Long</option><option value="short">Short</option></select></label></div><p className="text-xs text-muted-foreground">Use the multiplier from the contract specification. Collateral is not your maximum loss. No options or exchange margin calls are simulated.</p></>}
   <button disabled={mutation.isPending} className="rounded-full bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50">{mutation.isPending?'Calculating…':'Run calculation'}</button>
  </form>
  {mutation.error&&<p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
  {data&&<div aria-live="polite" className="space-y-4 rounded-2xl border border-border p-4">
   <p className="text-xs text-muted-foreground">Last calculation. Editing inputs does not update these results until you run the calculation again.</p>
   {'contributions' in data&&<details><summary className="text-sm cursor-pointer">Quote dates used · {data.datedQuoteCoverage} dated holdings</summary><p className="text-xs text-muted-foreground py-2">Portfolio values and P/L are in KES. Different quote dates do not represent a synchronized live market.</p>{data.contributions.map(p=><p key={p.symbol} className="text-xs py-1">{p.symbol} · {p.asOf??'Unknown date'}</p>)}</details>}
   {'contributions' in data?<><ResultGrid values={{'Portfolio value':data.totalValue,'Scenario P/L':data.pnl,'Stressed value':data.stressedValue,'Change (%)':data.returnPercent}}/><p className="text-xs">Coverage: {data.coverage} · {new Date(data.generatedAt).toLocaleString()}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Holding</th><th>Change</th><th>P/L</th></tr></thead><tbody>{data.contributions.map(p=><tr key={p.symbol} className="border-t"><td className="py-2">{p.symbol} · {p.sector}</td><td className="text-right">{number(p.shock*100)}%</td><td className="text-right">{number(p.pnl)}</td></tr>)}</tbody></table></div>{data.warnings.map(w=><p key={w} className="text-xs text-muted-foreground">{w}</p>)}<p className="text-xs text-muted-foreground">{data.methodology}</p></>:
    'dirtyPrice' in data?<><ResultGrid values={{'Dirty price':data.dirtyPrice,'Accrued interest':data.accruedInterest,'Clean price':data.cleanPrice,'Modified duration':data.modifiedDuration,Convexity:data.convexity,'DV01':data.dv01,'Stressed dirty price':data.stressedDirtyPrice,'Exact P/L':data.pnl,'Duration/convexity P/L':data.approximatePnl}}/><details><summary>Discounted payment schedule</summary>{data.cashFlows.map(f=><p key={f.date} className="text-sm">{f.date} · payment {number(f.amount)} · present value {number(f.presentValue)}</p>)}</details><p className="text-xs text-muted-foreground">{data.basis}</p></>:
    <><ResultGrid values={{Notional:data.notional,'Mark-to-market P/L':data.pnl,'Additional stress P/L':data.stressPnl,'Collateral after P/L':data.marginBalance,'Collateral after stress':data.stressedMarginBalance,Leverage:data.effectiveLeverage}}/>{data.expired&&<p className="text-destructive text-sm">The entered contract has expired. This is a historical illustration only.</p>}<p className="text-xs text-muted-foreground">{data.basis}</p></>}
   {data.assumptions!=null&&<details><summary className="text-sm cursor-pointer">Assumptions used in this calculation</summary><pre className="whitespace-pre-wrap break-all text-xs py-3">{JSON.stringify(data.assumptions,null,2)}</pre></details>}
   <ExportResearch name={`engine-${tab}-${data.generatedAt??'calculation'}`} data={data}/>
  </div>}
 </section>;
}
