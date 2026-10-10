import { useMemo, useState } from "react";
import { ToolHelp } from "@/components/shared/ToolHelp";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { ValueSignal } from "./ValueSignal";
import { financialNumber } from "@/lib/financialPresentation";
import { PremiumDetail } from "@/components/engine/PremiumDetail";
import { ScenarioWorkbench } from "./ForecastWorkbenches";

const finite = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const percent = (value: number) => `${value.toFixed(1)}%`;

export function FundamentalsInsights({
  symbol,
  currency,
  basic = false,
}: {
  symbol: string;
  currency: string;
  basic?: boolean;
}) {
  const { history } = useStockFinancials(symbol, {
    periodType: "annual",
    limit: 10,
  });
  const [returnMetric, setReturnMetric] = useState<"ROE" | "ROA" | "ROCE">(
    "ROE",
  );
  const [forecastMetric, setForecastMetric] = useState<
    "Revenue" | "Net income"
  >("Revenue");
  const [growth, setGrowth] = useState(5);
  const sorted = useMemo(
    () => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear),
    [history],
  );
  const returns = sorted
    .map((row) => {
      const income = finite(row.netIncome);
      const operating = finite(row.operatingIncome);
      const equity = finite(row.totalEquity);
      const assets = finite(row.totalAssets);
      const liabilities = finite(row.currentLiabilities);
      const denominator =
        assets != null && liabilities != null ? assets - liabilities : null;
      return {
        year: String(row.fiscalYear),
        ROE:
          income != null && equity && equity > 0
            ? (income / equity) * 100
            : null,
        ROA:
          income != null && assets && assets > 0
            ? (income / assets) * 100
            : null,
        ROCE:
          operating != null && denominator && denominator > 0
            ? (operating / denominator) * 100
            : null,
      };
    })
    .filter((row) => row[returnMetric] != null);
  const latest = sorted[sorted.length - 1];
  const base = latest
    ? finite(forecastMetric === "Revenue" ? latest.revenue : latest.netIncome)
    : null;
  const forecast =
    base != null && base > 0
      ? [
          { year: String(latest.fiscalYear), actual: base, scenario: base },
          ...[1, 2, 3].map((step) => ({
            year: String(latest.fiscalYear + step),
            actual: null,
            scenario: base * (1 + growth / 100) ** step,
          })),
        ]
      : [];
  const chartProps = {
    stroke: "hsl(var(--border))",
    strokeDasharray: "3 5",
    vertical: false,
  };
  const tooltipStyle = {
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 0,
  };

  return (
    <div className="space-y-0">
      <ValueSignal symbol={symbol} currency={currency}/>
      <section className="border-t border-border/70 py-6 space-y-4">
        <div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Return on capital</h3> <ToolHelp tool="Return on capital"/></div>
        <div className="flex gap-1" role="tablist" aria-label="Return metric">
          {(["ROE", "ROA", "ROCE"] as const).map((metric) => (
            <button
              key={metric}
              role="tab"
              aria-selected={returnMetric === metric}
              onClick={() => setReturnMetric(metric)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap ${returnMetric === metric ? "contrast-active" : "text-muted-foreground hover:text-foreground"}`}
            >
              {metric}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {returnMetric === "ROCE"
            ? "Operating income ÷ (total assets − current liabilities)."
            : returnMetric === "ROE"
              ? "Net income ÷ total equity."
              : "Net income ÷ total assets."}{" "}
          Only reported annual periods with both inputs appear.
        </p>
        {returns.length ? (
          <div
            className="h-56"
            role="img"
            aria-label={`${returnMetric} annual trend`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={returns}>
                <CartesianGrid {...chartProps} />
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: "0.6875rem", fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickFormatter={percent}
                  tick={{ fontSize: "0.625rem" }}
                  width={45}
                />
                <Tooltip
                  formatter={(value: number) => percent(Number(value))}
                  contentStyle={tooltipStyle}
                />
                <Line
                  type="linear"
                  dataKey={returnMetric}
                  stroke="#4f7cf5"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No verified annual data for {returnMetric} yet.
          </p>
        )}
      </section>
      <section className="border-t border-border/70 py-6 space-y-4">
        <div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Scenario forecast</h3> <ToolHelp tool="Scenario forecast"/></div>
        <p className="text-xs text-muted-foreground">
          Illustrative calculation from the latest filed figure, not an analyst
          consensus or a prediction.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-1"
            role="tablist"
            aria-label="Scenario metric"
          >
            {(["Revenue", "Net income"] as const).map((metric) => (
              <button
                key={metric}
                role="tab"
                aria-selected={forecastMetric === metric}
                onClick={() => setForecastMetric(metric)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap ${forecastMetric === metric ? "contrast-active" : "text-muted-foreground hover:text-foreground"}`}
              >
                {metric}
              </button>
            ))}
          </div>
          <label className="ml-auto text-xs">
            Annual growth{" "}
            <input
              aria-label="Scenario annual growth percent"
              type="number"
              min="-50"
              max="50"
              step="1"
              value={growth}
              onChange={(event) =>
                setGrowth(
                  Math.max(-50, Math.min(50, Number(event.target.value) || 0)),
                )
              }
              className="ml-2 w-16 rounded-md border border-border bg-background px-2 py-1"
            />
            %
          </label>
        </div>
        {forecast.length ? (
          <div
            className="h-56"
            role="img"
            aria-label={`${forecastMetric} scenario forecast`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast}>
                <CartesianGrid {...chartProps} />
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: "0.6875rem", fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickFormatter={(value: number) =>
                    financialNumber(value)
                  }
                  tick={{ fontSize: "0.625rem" }}
                  width={48}
                />
                <Tooltip
                  formatter={(value: number) =>
                    financialNumber(value, currency)
                  }
                  contentStyle={tooltipStyle}
                />
                <Line
                  dataKey="actual"
                  name="Reported"
                  stroke="#4f7cf5"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="scenario"
                  name="Scenario"
                  stroke="#f97316"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No positive reported {forecastMetric.toLowerCase()} is on file to
            anchor a scenario.
          </p>
        )}
        {!basic&&base!=null&&base>0&&<div className="overflow-x-auto"><h4 className="text-sm font-semibold">Growth sensitivity · {currency}</h4><table className="w-full text-xs whitespace-nowrap"><thead><tr><th className="text-left py-2">Annual growth</th>{[1,2,3].map(y=><th key={y} className="px-3 text-right">Year {y}</th>)}</tr></thead><tbody>{[Math.max(-50,growth-5),growth,Math.min(50,growth+5)].map((g,i)=><tr key={i} className="border-t border-border"><th className="text-left py-2 font-normal">{g.toFixed(1)}%</th>{[1,2,3].map(y=><td key={y} className="px-3 text-right">{financialNumber(base*(1+g/100)**y)}</td>)}</tr>)}</tbody></table><p className="text-xs text-muted-foreground">Constant compounded growth; no probability, valuation multiple or price target is implied.</p></div>}
        <PremiumDetail title="Scenario forecast research" symbol={symbol} currency={currency}><ScenarioWorkbench symbol={symbol} currency={currency}/></PremiumDetail>
      </section>
    </div>
  );
}
