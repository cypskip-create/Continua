import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useStockFinancials } from "@/hooks/useStockFinancials";

interface Props { symbol: string; exchange: string; marketCap: string }

/** All real, from Continua's own company profile and data pipeline —
 *  no S&P Global attribution here since Continua's sources are its own
 *  NSE scraper and market data feed, not a licensed third-party bundle. */
export function CompanyInfoSection({ symbol, exchange, marketCap }: Props) {
  const { profile, isLoading } = useCompanyProfile(symbol);
  const { latest } = useStockFinancials(symbol);
  const company = profile?.company;
  const sharesOutstanding = latest?.sharesOutstanding != null ? `${(latest.sharesOutstanding / 1e6).toFixed(2)}m` : "n/a";

  return (
    <ReportSection number={9} title={`${company?.name ?? symbol} Company Information`} intro="Employee count, exchange listing, and where Continua's data comes from.">
      <SubWidget number="9.1" title="Key Information">
        {isLoading ? <p className="text-xs text-muted-foreground py-4">Loading…</p> : (
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-[12px]">
            <Row label="Name" value={company?.name ?? symbol} />
            <Row label="Ticker" value={symbol} />
            <Row label="Exchange" value={exchange} />
            <Row label="Founded" value={company?.founded ?? "n/a"} />
            <Row label="Sector" value={company?.sectorName ?? "n/a"} />
            <Row label="Headquarters" value={company?.headquarters ?? "n/a"} />
            <Row label="Market Cap" value={marketCap} />
            <Row label="Shares Outstanding" value={sharesOutstanding} />
            {company?.website && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Website: </span>
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">{company.website}</a>
              </div>
            )}
          </div>
        )}
        {company?.description && <p className="text-[11.5px] text-muted-foreground mt-4 leading-relaxed">{company.description}</p>}
      </SubWidget>

      <SubWidget number="9.2" title="Number of Employees" description="Continua's data layer gives a current employee count, not a multi-year history yet — chart currently plots one real point.">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={company?.employees ? [{ period: "Current", employees: parseFloat(company.employees.replace(/[^0-9.]/g, "")) || 0 }] : []}>
              <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Area type="monotone" dataKey="employees" stroke="hsl(160 84% 58%)" fill="hsl(160 84% 58%)" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!company?.employees && <p className="text-xs text-muted-foreground mt-1">No employee count on file for {symbol} yet.</p>}
      </SubWidget>

      <SubWidget number="9.3" title="Data Sources" description="Where Continua's numbers in this report actually come from.">
        <div className="space-y-2 text-[12px]">
          <SourceRow pkg="Market Prices" data="NSE end-of-day feed" note="Live and historical daily candles" />
          <SourceRow pkg="Company Financials" data="Continua's NSE announcement scraper" note="Income statement, balance sheet, cash flow — from scraped and parsed PDF filings" />
          <SourceRow pkg="Dividends & Corporate Actions" data="Continua's NSE announcement scraper" note="Dividends, splits, bonus/rights issues, buybacks, M&A" />
          <SourceRow pkg="Ownership" data="Continua's NSE announcement scraper" note="Major shareholders where disclosed" />
          <SourceRow pkg="Analyst Estimates" data="Not currently ingested" note="No forward estimates feed — shown honestly as unavailable throughout this report" />
        </div>
      </SubWidget>
    </ReportSection>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function SourceRow({ pkg, data, note }: { pkg: string; data: string; note: string }) {
  return (
    <div className="flex flex-col border-b border-border/30 pb-2 last:border-0">
      <span className="font-semibold">{pkg}</span>
      <span className="text-muted-foreground">{data} — {note}</span>
    </div>
  );
}