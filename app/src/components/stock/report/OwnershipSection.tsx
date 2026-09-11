import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ReportSection, SubWidget } from "./ReportSection";

interface OwnershipRow { name: string; value: number; color: string }
interface ShareholderRow { name: string; type: string; pct: number }
interface Props {
  ownership: OwnershipRow[];
  topShareholders: ShareholderRow[];
  isLoading?: boolean;
}

const WINDOWS = ["0-3 months", "3-6 months", "6-9 months", "9-12 months"];

/** Ownership Breakdown and Top Shareholders are real, from useOwnership
 *  (corporateActionsApi's /ownership/:symbol) — passed in directly rather
 *  than merged with any mock dataset, so a symbol with nothing on file
 *  yet honestly shows "No ownership data on file yet" instead of
 *  silently substituting another stock's-shaped demo percentages under
 *  a "Real shareholder composition" label. Insider Transactions has no
 *  real source at all — there's no insider-trading disclosure feed or
 *  corporate action type for it — so that table renders honestly at
 *  zero, in the same 0–3/3–6/6–9/9–12 month layout, rather than
 *  inventing trades.
 */
export function OwnershipSection({ ownership, topShareholders, isLoading }: Props) {
  const total = ownership.reduce((s, d) => s + d.value, 0);
  const norm = ownership.map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));

  return (
    <ReportSection number={8} title="Ownership" intro="Who are the major shareholders and have insiders been buying or selling?">
      <SubWidget number="8.1" title="Recent Insider Transactions" description="Continua has no insider-trading disclosure feed yet — shown honestly at zero rather than invented.">
        <div className="rounded-xl overflow-hidden border border-border/50">
          <div className="grid grid-cols-3 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide">
            <span className="p-2">Period</span>
            <span className="p-2 text-right text-bear">Shares sold</span>
            <span className="p-2 text-right text-bull">Shares bought</span>
          </div>
          {WINDOWS.map((w) => (
            <div key={w} className="grid grid-cols-3 border-t border-border/40">
              <span className="p-2 text-[11px] text-muted-foreground">{w}</span>
              <div className="p-2 flex items-center justify-end">
                <div className="h-2 w-0 bg-bear/40 rounded-full mr-2" />
                <span className="text-[11px] tabular">0</span>
              </div>
              <div className="p-2 flex items-center justify-end">
                <div className="h-2 w-0 bg-bull/40 rounded-full mr-2" />
                <span className="text-[11px] tabular">0</span>
              </div>
            </div>
          ))}
        </div>
      </SubWidget>

      <SubWidget number="8.2" title="Ownership Breakdown" description="Real shareholder composition, from Continua's ownership data.">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={norm.length > 0 ? norm : [{ name: "No data", pct: 100, color: "hsl(var(--muted-foreground) / 0.2)" }]}
                dataKey="pct"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={1.5}
                stroke="none"
              >
                {(norm.length > 0 ? norm : [{ name: "No data", pct: 100, color: "hsl(var(--muted-foreground) / 0.2)" }]).map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [`${(v as number).toFixed(1)}%`, n]}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "hsl(var(--popover-foreground))",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center -mt-2">Loading…</p>
        ) : norm.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center -mt-2">No ownership data on file yet.</p>
        ) : (
          <>
            <div className="flex h-3 w-full rounded-full overflow-hidden -mt-2 mb-3">
              {norm.map((d) => (
                <div
                  key={d.name}
                  className="h-full"
                  style={{ width: `${d.pct}%`, background: d.color }}
                  title={`${d.name}: ${d.pct.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="space-y-2">
              {norm.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <span className="font-bold tabular">{d.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="section-eyebrow mt-4 mb-2">Top Shareholders</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        ) : topShareholders.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No shareholder records on file yet.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {topShareholders.map((s) => (
              <div key={s.name} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.type}</p>
                </div>
                <span className="text-xs font-bold tabular shrink-0">{s.pct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        )}
      </SubWidget>
    </ReportSection>
  );
}