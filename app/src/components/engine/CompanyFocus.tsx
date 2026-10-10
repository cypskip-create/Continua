import { Link } from "react-router-dom";
import { StockSnowflake } from "@/components/stock/tabs/StockSnowflake";
import { FundamentalsInsights } from "@/components/stock/FundamentalsInsights";
import { EarningsFundamentals } from "@/components/stock/EarningsFundamentals";
import { FutureGrowthSection } from "@/components/stock/report/FutureGrowthSection";
import { RiskSection } from "@/components/stock/report/RiskSection";
import { BasicPriceForecast } from "@/components/stock/ValueSignal";

/** Basics inherit the stock's Fundamentals allowance; only expanded research is paid. */
export function CompanyForecast({symbol,currency}: {symbol:string;currency:string}) {
  const prefix=`forecast-${symbol}`;
  return <div aria-label="Engine Forecast tools">
    <header className="py-5"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Powered by Continua Engine</p><h2 className="mt-2 text-xl font-semibold">Company Forecast</h2><p className="mt-2 text-sm text-muted-foreground">Basic ratings, price illustrations, estimates and scorecards are included in your Fundamentals allowance. Premium adds expanded research and sensitivity tools.</p></header>
    <section id={`${prefix}-0`} className="scroll-mt-48"><FundamentalsInsights symbol={symbol} currency={currency} basic/></section>
    <section id={`${prefix}-1`} className="scroll-mt-48 border-t border-border py-5"><StockSnowflake symbol={symbol} currency={currency} basic/></section>
    <section id={`${prefix}-2`} className="scroll-mt-48"><BasicPriceForecast symbol={symbol} currency={currency}/></section>
    <section id={`${prefix}-3`} className="scroll-mt-48"><EarningsFundamentals symbol={symbol} currency={currency} mode="analysis"/></section>
    <section id={`${prefix}-4`} className="scroll-mt-48 border-t border-border py-5"><FutureGrowthSection symbol={symbol} currency={currency} basic/></section>
    <section id={`${prefix}-5`} className="scroll-mt-48 border-t border-border py-5"><RiskSection symbol={symbol} currency={currency} basic/></section>
    <nav aria-label="Continue in Engine" className="flex flex-wrap gap-4 border-t border-border py-4 text-sm font-semibold text-primary">{["Technicals","Peers","Monitoring","Ask Engine"].map(tool=><Link key={tool} to={`/engine?symbol=${encodeURIComponent(symbol)}&tool=${encodeURIComponent(tool)}`}>{tool} →</Link>)}</nav>
  </div>;
}
