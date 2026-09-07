import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { useDividendHistory } from "@/hooks/useDividendHistory";
import { useResearch } from "@/hooks/useResearch";
import { useMarketBenchmark } from "@/hooks/useMarketBenchmark";
import { useStockFinancials } from "@/hooks/useStockFinancials";

interface Props { symbol: string; currency: string; divYield: string; annualDividend: string }

function Donut({ pct, label, color }: { pct: number | null; label: string; color: string }) {
  const value = pct ?? 0;
  return (
    <div className="text-center">
      <div className="w-32 h-32 mx-auto relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={[{ v: Math.min(100, Math.max(0, value)) }, { v: 100 - Math.min(100, Math.max(0, value)) }]} dataKey="v" innerRadius={44} outerRadius={60} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={pct == null ? "hsl(var(--muted-foreground) / 0.3)" : color} />
              <Cell fill="hsl(var(--muted))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold">{pct != null ? `${pct.toFixed(0)}%` : "N/A"}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">{label}</p>
    </div>
  );
}

export function DividendsSection({ symbol, currency, divYield, annualDividend }: Props) {
  const { history: dividendHistory, isLoading: divLoading } = useDividendHistory(symbol);
  const { research } = useResearch(symbol);
  const { averages: benchmark } = useMarketBenchmark();
  const { latest } = useStockFinancials(symbol);
  const ratios = research?.ratios;

  const sorted = [...dividendHistory].sort((a, b) => a.year.localeCompare(b.year));
  const stable = sorted.length >= 3;
  const growing = sorted.length >= 2 && sorted[sorted.length - 1].dps >= sorted[sorted.length - 2].dps;
  const payout = ratios?.payoutRatio != null ? ratios.payoutRatio * 100 : null;
  const cashPayout = latest?.freeCashFlow && latest.freeCashFlow > 0 && payout != null
    ? Math.min(100, ((parseFloat(annualDividend) || 0) * 1e0) / (latest.freeCashFlow / 1e9) * 100)
    : null;

  const checks = [
    { label: "Pays a dividend", status: sorted.length > 0 ? "pass" as const : "fail" as const },
    { label: "Stable dividend (last 10 years)", status: sorted.length >= 5 ? "pass" as const : "unknown" as const },
    { label: "Growing dividend", status: sorted.length >= 2 ? (growing ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Dividend covered by earnings", status: payout != null ? (payout < 100 ? "pass" as const : "fail" as const) : "unknown" as const },
  ];

  return (
    <ReportSection number={5} title="Dividend">
      <CriteriaChecklist
        checks={checks}
        narrative={sorted.length === 0 ? `${symbol} doesn't currently pay a dividend, or none is on file yet.` : `${symbol} has paid dividends in ${sorted.length} of the years on file. ${payout != null ? `${payout.toFixed(0)}% of earnings are paid out.` : ""}`}
      />

      <KeyInfoUpdates
        rows={[
          { label: "Dividend yield", value: `${divYield}%`, highlight: true },
          { label: "Annual dividend", value: `${currency}${annualDividend}`, highlight: true },
          { label: "Payout ratio", value: payout != null ? `${payout.toFixed(0)}%` : "n/a" },
          { label: "Years of payment history on file", value: String(sorted.length) },
        ]}
        updates={[]}
        updatesTitle="Recent dividend updates"
      />

      <SubWidget number="6.1" title="Stability and Growth of Payments" description="Real dividend-per-share history — no forecast is shown since Continua has no analyst dividend estimates.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted.map((d) => ({ year: d.year, dps: d.dps }))}>
              <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v: number) => [`${currency}${v}`, "DPS"]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="dps" fill="hsl(var(--bull))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{divLoading ? "Loading…" : sorted.length === 0 ? `No dividend history on file for ${symbol} yet.` : !stable ? "Insufficient years on file to determine long-term stability." : "Real, confirmed payout history."}</p>
      </SubWidget>

      <SubWidget number="6.2" title="Dividend Yield vs Market" description="Company yield against the same NSE market-cap sample used across Continua's benchmarks.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: "Yield", Company: parseFloat(divYield) || 0, "Market Avg": benchmark.dividendYield ?? 0 }]}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} unit="%" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, ""]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="Company" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar dataKey="Market Avg" fill="hsl(330 81% 60%)" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SubWidget>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SubWidget number="6.3" title="Earnings Payout to Shareholders">
          <Donut pct={payout} label="Paid as dividend" color={payout != null && payout > 90 ? "hsl(var(--bear))" : "hsl(var(--bull))"} />
          {payout == null && <p className="text-[10px] text-muted-foreground text-center mt-2">No payout ratio on file.</p>}
        </SubWidget>
        <SubWidget number="6.4" title="Cash Payout to Shareholders">
          <Donut pct={cashPayout} label="Of free cash flow" color={cashPayout != null && cashPayout > 90 ? "hsl(var(--bear))" : "hsl(var(--bull))"} />
          {cashPayout == null && <p className="text-[10px] text-muted-foreground text-center mt-2">{sorted.length === 0 ? "Does not pay a dividend." : "Not enough cash flow data on file to compute this."}</p>}
        </SubWidget>
      </div>
    </ReportSection>
  );
}