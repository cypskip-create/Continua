/**
 * Moomoo-style research bar chart.
 *
 * Design rules (matched to Moomoo's fundamentals charts):
 *  • Generous canvas — 260px tall by default, full container width.
 *  • Thick, well-spaced bars (18px wide, 24% category gap).
 *  • NO tooltip on tap. Tapping a group moves the value readout that sits
 *    directly beneath the chart, above the colour key. Each series value is
 *    stacked on its own line and painted in that series' colour.
 *  • Annual / Quarterly dropdown when quarterly data is supplied:
 *    annual shows the last 3 years, quarterly the last 5 quarters.
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import { axisStyle, gridStyle } from "@/lib/chartPalette";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChartPeriod, lastAnnual, lastQuarterly, ANNUAL_PERIODS, QUARTERLY_PERIODS,
} from "@/lib/chartPeriods";

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  /** Section eyebrow shown above the chart. */
  title: string;
  /** Annual rows (full history — trimmed internally to the last 3). */
  annual: any[];
  /** Shows the Annual / Quarterly dropdown, but only once real `quarterly`
   *  rows are supplied — there is no fabricated fallback, so passing this
   *  true with no `quarterly` data has no visible effect. */
  allowQuarterly?: boolean;
  /** Real quarterly rows (from a quarterly-period financials fetch). */
  quarterly?: any[];
  xKey: string;
  series: BarSeries[];
  /** Y axis tick formatter. */
  yFmt?: (v: number) => string;
  /** Readout value formatter. */
  valueFmt?: (v: any, s: BarSeries) => string;
  /** Per-row colour override (e.g. forecast bars, beat/miss bars). */
  colorFor?: (row: any, s: BarSeries) => string;
  height?: number;
  /** Extra control rendered to the right of the title (metric toggles etc). */
  right?: React.ReactNode;
  note?: string;
  stackId?: string;
  /** Override how many annual rows to show (default 3). */
  annualCount?: number;
}

export function BarChartBlock({
  title, annual, allowQuarterly, quarterly, xKey, series,
  yFmt, valueFmt, colorFor, height = 260, right, note, stackId, annualCount,
}: Props) {
  const [period, setPeriod] = useState<ChartPeriod>("annual");
  const [active, setActive] = useState<number | null>(null);

  const hasQuarterly = !!quarterly && quarterly.length > 0;
  // Falling back to annual bars while the dropdown reads "Quarterly" would
  // misrepresent what's on screen, so an empty quarterly result shows its
  // own explicit empty state instead of silently substituting annual data.
  const showingEmptyQuarterly = period === "quarterly" && !hasQuarterly;

  const data = useMemo(() => {
    if (period === "quarterly") {
      return hasQuarterly ? lastQuarterly(quarterly!, QUARTERLY_PERIODS) : [];
    }
    return lastAnnual(annual, annualCount ?? ANNUAL_PERIODS);
  }, [period, annual, quarterly, hasQuarterly, annualCount]);

  const idx = active !== null && active < data.length ? active : data.length - 1;
  const row = data[idx];

  const fmt = (v: any, s: BarSeries) =>
    valueFmt ? valueFmt(v, s) : v === null || v === undefined ? "—" : String(v);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
        <div className="flex items-center gap-1.5">
          {right}
          {/* Shown whenever the caller opts in, not just once quarterly
              rows happen to exist — otherwise the control disappears for
              any stock the quarterly pipeline hasn't reached yet, which
              reads as the feature being broken rather than as "no data
              yet" for this one stock. */}
          {allowQuarterly && (
            <Select value={period} onValueChange={(v) => { setPeriod(v as ChartPeriod); setActive(null); }}>
              <SelectTrigger className="h-6 w-[92px] text-[10px] px-2 rounded-md border-border/70" aria-label="Reporting period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="annual" className="text-[11px]">Annual</SelectItem>
                <SelectItem value="quarterly" className="text-[11px]">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 pt-3" style={{ height }}>
        {showingEmptyQuarterly ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground text-center px-6">No quarterly figures on file for this stock yet — try Annual.</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 6, bottom: 0, left: -14 }}
            barCategoryGap="24%"
            barGap={4}
            onClick={(s: any) => {
              if (s && typeof s.activeTooltipIndex === "number") setActive(s.activeTooltipIndex);
            }}
          >
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey={xKey} {...axisStyle} interval={0} />
            <YAxis {...axisStyle} tickFormatter={yFmt as any} width={44} />
            {series.map(s => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                barSize={18}
                stackId={stackId}
                isAnimationActive={false}
                onClick={(_row: any, index: number) => setActive(index)}
              >
                {data.map((r, i) => (
                  <Cell
                    key={i}
                    fill={colorFor ? colorFor(r, s) : s.color}
                    fillOpacity={i === idx ? 1 : 0.72}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Value readout — below the chart, above the key (Moomoo pattern) */}
      {row && !showingEmptyQuarterly && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">{String(row[xKey])}</p>
          <div className="space-y-0.5">
            {series.map(s => (
              <div key={s.key} className="flex items-baseline justify-between gap-3">
                <span className="text-[10px]" style={{ color: colorFor ? colorFor(row, s) : s.color }}>{s.label}</span>
                <span
                  className="text-[12px] font-semibold tabular"
                  style={{ color: colorFor ? colorFor(row, s) : s.color }}
                >
                  {fmt(row[s.key], s)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Colour key */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
        {series.map(s => (
          <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {note && <p className="text-[10px] text-muted-foreground mt-1.5">{note}</p>}
    </div>
  );
}