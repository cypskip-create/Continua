import { InfoTip } from "./InfoTip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Cell,
  Tooltip,
} from "recharts";
import { fx, tooltipStyle } from "@/lib/chartPalette";

export interface ReturnsBreakdownFigure {
  label: string;
  value: number | null; // null = "No Data" (not tracked yet)
}

interface ReturnsBreakdownProps {
  unrealized: number;
  dividends: number;
  /** Realized P&L needs closed-lot tracking Continua doesn't record yet. */
  realized?: number | null;
  /** Multi-currency holdings aren't supported yet — everything is KES. */
  currency?: number | null;
  showValues?: boolean;
  currencyLabel?: string;
}

const fmt = (v: number, currencyLabel: string) =>
  `${currencyLabel}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReturnsBreakdown({
  unrealized,
  dividends,
  realized = null,
  currency = null,
  showValues = true,
  currencyLabel = "KSh",
}: ReturnsBreakdownProps) {
  const total = unrealized + dividends + (realized ?? 0) + (currency ?? 0);

  const figures: ReturnsBreakdownFigure[] = [
    { label: "Unrealized", value: unrealized },
    { label: "Realized", value: realized },
    { label: "Dividends", value: dividends },
    { label: "Currency", value: currency },
    { label: "Total", value: total },
  ];

  const hasLimitedData = figures.some((f) => f.value === null);
  const chartMax = Math.max(1, ...figures.map((f) => Math.abs(f.value ?? 0)));

  const colorFor = (f: ReturnsBreakdownFigure, isTotal: boolean) => {
    if (f.value === null) return "hsl(var(--muted-foreground) / 0.15)";
    if (isTotal) return f.value >= 0 ? fx.netIncome : fx.debt;
    return f.value >= 0 ? "hsl(var(--bull))" : "hsl(var(--bear))";
  };

  const chartData = figures.map((f) => ({
    name: f.label,
    value: f.value ?? 0,
    raw: f.value,
  }));

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-serif text-lg flex items-center gap-1.5">
          Returns Breakdown
          <InfoTip>Unrealized is live price vs. your average cost. Realized and Currency show "No Data" — Continua doesn't track closed lots or multi-currency positions yet.</InfoTip>
        </h3>
        {hasLimitedData && (
          <span className="text-[0.5625rem] font-bold tracking-wider uppercase px-2 py-1 rounded-full bg-muted text-muted-foreground">
            Limited Data
          </span>
        )}
      </div>

      {/* Value row above each column, mirroring the bar beneath it */}
      <div className="grid grid-cols-5 gap-1 mt-4 mb-1 text-center">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <p
              className={`text-[0.6875rem] font-semibold tabular truncate ${
                f.value === null
                  ? "text-muted-foreground/60"
                  : f.value >= 0
                  ? "text-bull"
                  : "text-bear"
              } ${f.label === "Total" ? "font-bold" : ""}`}
            >
              {f.value === null
                ? "No Data"
                : `${showValues ? (f.value < 0 ? "−" : "") + fmt(f.value, currencyLabel) : "••••"}`}
            </p>
          </div>
        ))}
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis dataKey="name" hide />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
              contentStyle={tooltipStyle}
              formatter={(_: number, __: string, entry) => {
                const raw = (entry.payload as { raw: number | null }).raw;
                return [raw === null ? "No Data" : (showValues ? fmt(raw, currencyLabel) : "••••"), ""];
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {chartData.map((entry, i) => (
                <Cell key={entry.name} fill={colorFor(figures[i], figures[i].label === "Total")} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-5 gap-1 mt-1 pt-2 border-t border-border/50 text-center">
        {figures.map((f) => (
          <p key={f.label} className={`text-[0.625rem] truncate ${f.label === "Total" ? "font-bold" : "text-muted-foreground"}`}>
            {f.label}
          </p>
        ))}
      </div>
    </div>
  );
}
