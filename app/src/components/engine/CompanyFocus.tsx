import { Link } from "react-router-dom";
import { StockSnowflake } from "@/components/stock/tabs/StockSnowflake";
import { FundamentalsInsights } from "@/components/stock/FundamentalsInsights";
import { EarningsFundamentals } from "@/components/stock/EarningsFundamentals";
import { ResearchPreview } from "@/components/stock/FundamentalResearch";
import { FutureGrowthSection } from "@/components/stock/report/FutureGrowthSection";
import { RiskSection } from "@/components/stock/report/RiskSection";

const sections=["Rating & scenarios","Company scorecard","Research","Forecasts","Growth context","Risk"];

/** Shared by stock Focus and the subscriber-only Engine workspace. */
export function CompanyFocus({symbol,currency}: {symbol:string;currency:string}) {
  const prefix=`focus-${symbol}`;
  return <div aria-label="Engine Focus tools">
    <header className="py-5"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Powered by Continua Engine</p><h2 className="mt-2 text-xl font-semibold">Company Focus</h2><p className="mt-2 text-sm text-muted-foreground">Ratings explain model assumptions. Estimates and scenarios are separate from reported results—not promises.</p></header>
    <nav aria-label="Focus shortcuts" className="flex flex-wrap gap-2 pb-4">{sections.map((label,i)=><a key={label} className="rounded-full border border-border px-3 py-2 text-xs font-semibold" href={`#${prefix}-${i}`}>{label}</a>)}</nav>
    <section id={`${prefix}-0`} className="scroll-mt-48"><FundamentalsInsights symbol={symbol} currency={currency}/></section>
    <section id={`${prefix}-1`} className="scroll-mt-48 border-t border-border py-5"><StockSnowflake symbol={symbol}/></section>
    <section id={`${prefix}-2`} className="scroll-mt-48"><ResearchPreview symbol={symbol} currency={currency}/></section>
    <section id={`${prefix}-3`} className="scroll-mt-48"><EarningsFundamentals symbol={symbol} currency={currency} mode="analysis"/></section>
    <section id={`${prefix}-4`} className="scroll-mt-48 border-t border-border py-5"><FutureGrowthSection symbol={symbol}/></section>
    <section id={`${prefix}-5`} className="scroll-mt-48 border-t border-border py-5"><RiskSection symbol={symbol}/></section>
    <nav aria-label="Continue in Engine" className="flex flex-wrap gap-4 border-t border-border py-4 text-sm font-semibold text-primary">{["Technicals","Peers","Monitoring","Ask Engine"].map(tool=><Link key={tool} to={`/engine?symbol=${encodeURIComponent(symbol)}&tool=${encodeURIComponent(tool)}`}>{tool} →</Link>)}</nav>
  </div>;
}
