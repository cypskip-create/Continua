import type {EngineBundle} from '@/api/engineApi';
import {ToolHelp} from '@/components/shared/ToolHelp';
import {ExportResearch} from './EngineResearchTools';
const number=(v:number|null,percent=false)=>v==null?'—':(v*(percent?100:1)).toLocaleString(undefined,{maximumFractionDigits:2})+(percent?'%':'');
export function CompanyEvidenceDesk({data}:{data:EngineBundle}){
 const d=data.diagnostics;if(!d)return null;
 return <section className="space-y-4 border-t pt-5">
  <div className="flex gap-2 items-center"><h3 className="text-lg font-semibold">Financial evidence checks</h3><ToolHelp tool="Financial evidence checks" description="Check whether reported profit is supported by cash, and whether margins or debt changed. Unknown means a figure is missing; these checks are not a buy or sell rating."/></div>
  <p className="text-sm text-muted-foreground">{d.knownChecks} of {d.totalChecks} checks have enough inputs. Check results do not establish investment suitability.</p>
  <div className="grid gap-3 sm:grid-cols-2">{d.checks.map(c=><div key={c.id} className="rounded-xl border p-3"><p className="flex justify-between gap-2 text-sm font-semibold">{c.label}<span className={c.result==='unknown'?'text-muted-foreground':c.result==='flag'?'text-amber-700':'text-primary'}>{c.result==='pass'?'Met':c.result==='flag'?'Review':'Unknown'}</span></p><p className="mt-2 text-xs text-muted-foreground">{c.reason}</p></div>)}</div>
  <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="text-left py-2 font-semibold">Reported-period trend matrix</caption><thead><tr><th className="text-left">Year</th><th>Net margin</th><th>ROE</th><th>Cash/profit</th><th>Accruals/assets</th></tr></thead><tbody>{d.trends.map(t=><tr key={t.year} className="border-t"><td className="py-2">{t.year}</td><td className="text-right">{number(t.netMargin,true)}</td><td className="text-right">{number(t.roe,true)}</td><td className="text-right">{number(t.cashConversion)}</td><td className="text-right">{number(t.accrualsToAssets,true)}</td></tr>)}</tbody></table></div>
  <details><summary className="cursor-pointer font-semibold text-sm">Source and availability ledger</summary><div className="max-h-96 overflow-auto space-y-3 py-3">{d.evidence.map(e=><div key={`${e.year}:${e.field}`} className="border-t py-2 text-xs"><p className="font-semibold">FY{e.year} · {e.field} · {number(e.value)}</p><p>{e.basis} · period end {e.periodEnd??'Unknown'} · available {e.availableAt??'Unknown'}</p>{e.sourceUrls.filter(url=>/^https:\/\//i.test(url)).map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-primary">Source filing</a>)}</div>)}</div></details>
  <p className="text-xs text-muted-foreground">{d.methodology}</p><ExportResearch name={`${data.symbol}-evidence-${data.generatedAt}`} data={{symbol:data.symbol,generatedAt:data.generatedAt,diagnostics:d}}/>
 </section>;
}
