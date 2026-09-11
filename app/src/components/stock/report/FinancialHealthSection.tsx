import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";
import { CriteriaChecklist } from "./CriteriaChecklist";
import { KeyInfoUpdates } from "./KeyInfoUpdates";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { useResearch } from "@/hooks/useResearch";
import { fx } from "@/lib/chartPalette";

interface Props { symbol: string; currency: string }

function fmtB(v: number | undefined | null) {
  if (v == null) return "—";
  return `${(v / 1e9).toFixed(2)}B`;
}

export function FinancialHealthSection({ symbol, currency }: Props) {
  const { latest, isLoading } = useStockFinancials(symbol);
  const { research } = useResearch(symbol);
  const ratios = research?.ratios;

  const longTermAssets = latest && latest.currentAssets != null ? latest.totalAssets - latest.currentAssets : null;
  const longTermLiabilities = latest && latest.currentLiabilities != null ? latest.totalLiabilities - latest.currentLiabilities : null;

  const checks = [
    { label: "Short-term assets exceed short-term liabilities", status: latest?.currentAssets != null && latest?.currentLiabilities != null ? (latest.currentAssets > latest.currentLiabilities ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Long-term assets exceed long-term liabilities", status: longTermAssets != null && longTermLiabilities != null ? (longTermAssets > longTermLiabilities ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Debt is well covered by operating cash flow", status: latest?.totalDebt != null && latest?.operatingCashFlow != null ? (latest.totalDebt === 0 || latest.operatingCashFlow / latest.totalDebt > 0.2 ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Interest well covered by earnings", status: ratios?.interestCoverage != null ? (ratios.interestCoverage > 3 ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Debt to equity is manageable", status: ratios?.debtToEquity != null ? (ratios.debtToEquity < 100 ? "pass" as const : "fail" as const) : "unknown" as const },
    { label: "Has more cash than debt", status: latest?.cash != null && latest?.totalDebt != null ? (latest.cash >= latest.totalDebt ? "pass" as const : "fail" as const) : "unknown" as const },
  ];
  const passed = checks.filter((c) => c.status === "pass").length;

  return (
    <ReportSection number={4} title="Balance Sheet Health">
      <CriteriaChecklist
        checks={checks}
        narrative={!latest ? `No balance sheet on file for ${symbol} yet.` : `${symbol} has total shareholder equity of ${currency}${fmtB(latest.totalEquity)} and total debt of ${currency}${fmtB(latest.totalDebt)}, giving a debt-to-equity ratio of ${ratios?.debtToEquity != null ? `${ratios.debtToEquity.toFixed(0)}%` : "n/a"}. ${passed}/${checks.length} real checks pass.`}
      />

      <KeyInfoUpdates
        rows={[
          { label: "Debt to equity ratio", value: ratios?.debtToEquity != null ? `${ratios.debtToEquity.toFixed(0)}%` : "n/a", highlight: true },
          { label: "Debt", value: latest ? `${currency}${fmtB(latest.totalDebt)}` : "n/a", highlight: true },
          { label: "Interest coverage ratio", value: ratios?.interestCoverage != null ? `${ratios.interestCoverage.toFixed(1)}x` : "n/a" },
          { label: "Cash", value: latest ? `${currency}${fmtB(latest.cash)}` : "n/a" },
          { label: "Equity", value: latest ? `${currency}${fmtB(latest.totalEquity)}` : "n/a" },
          { label: "Total liabilities", value: latest ? `${currency}${fmtB(latest.totalLiabilities)}` : "n/a" },
          { label: "Total assets", value: latest ? `${currency}${fmtB(latest.totalAssets)}` : "n/a" },
        ]}
        updates={[]}
        updatesTitle="Recent financial health updates"
      />

      <SubWidget number="4.1" title="Financial Position Analysis" description="Short-term vs long-term assets and liabilities, most recent period on file.">
        {/* Frame always renders — zero-filled placeholder rows keep the same
            two-category shape until a real balance sheet is on file, rather
            than replacing the chart with a text box. */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: "Short Term", Assets: (latest?.currentAssets ?? 0) / 1e9, Liabilities: (latest?.currentLiabilities ?? 0) / 1e9 },
              { name: "Long Term", Assets: (longTermAssets ?? 0) / 1e9, Liabilities: (longTermLiabilities ?? 0) / 1e9 },
            ]}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v: number) => [`${currency}${v.toFixed(2)}B`, ""]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Assets" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Liabilities" fill="hsl(160 84% 58%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {(isLoading || !latest) && (
          <p className="text-xs text-muted-foreground mt-1">{isLoading ? "Loading…" : "No balance sheet on file yet — chart will populate once one is."}</p>
        )}
      </SubWidget>

      <SubWidget number="4.2" title="Debt to Equity History and Analysis" description="Continua doesn't have a multi-year debt/equity time series yet, so this chart currently plots one real point — it will fill in as more periods are reported.">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={latest ? [{ period: `FY${latest.fiscalYear}`, Debt: (latest.totalDebt ?? 0) / 1e9, Equity: latest.totalEquity / 1e9, Cash: (latest.cash ?? 0) / 1e9 }] : []}>
              <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip formatter={(v: number) => [`${currency}${v.toFixed(2)}B`, ""]} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="Equity" stroke={fx.revenue} fill={fx.revenue} fillOpacity={0.25} />
              <Area type="monotone" dataKey="Debt" stroke={fx.negative} fill={fx.negative} fillOpacity={0.25} />
              <Area type="monotone" dataKey="Cash" stroke={fx.positive} fill={fx.positive} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!latest && <p className="text-xs text-muted-foreground mt-1">No balance sheet on file yet — chart will populate once one is.</p>}
      </SubWidget>
    </ReportSection>
  );
}