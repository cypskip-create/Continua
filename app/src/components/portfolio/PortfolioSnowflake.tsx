import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface Holding {
  symbol: string;
  shares: number;
  avg_cost: number;
  price: number;
  value: number;
  gainPct: number;
  weight: number;
  sector?: string | null;
  created_at: string;
}

interface Props {
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  gainPct: number;
}

// Annualized IRR approximation: simple time-weighted average using oldest holding date
function calcIRR(totalValue: number, totalCost: number, holdings: Holding[]): number {
  if (!holdings.length || totalCost <= 0) return 0;
  const oldest = holdings.reduce((min, h) => {
    const t = new Date(h.created_at).getTime();
    return t < min ? t : min;
  }, Date.now());
  const years = Math.max(0.25, (Date.now() - oldest) / (365.25 * 24 * 3600 * 1000));
  const ratio = totalValue / totalCost;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
}

export function PortfolioSnowflake({ holdings, totalValue, totalCost, gainPct }: Props) {
  const hasHoldings = holdings.length > 0;

  const sectorCount = new Set(holdings.map(h => h.sector || "Other")).size;
  const maxWeight = Math.max(...holdings.map(h => h.weight), 0);
  const winners = holdings.filter(h => h.gainPct > 0).length;
  const irr = calcIRR(totalValue, totalCost, holdings);

  const score = (val: number, max: number) => Math.min(100, Math.max(5, (val / max) * 100));

  // With no holdings yet there's nothing real to score, so every axis sits
  // at a flat, neutral baseline — the pentagon frame is still there, just
  // empty, rather than the whole card disappearing.
  const data = hasHoldings ? [
    { metric: "Value", v: score(Math.max(0, gainPct + 20), 60) },
    { metric: "Growth", v: score(Math.max(0, irr + 10), 40) },
    { metric: "Diversity", v: score(sectorCount, 6) },
    { metric: "Stability", v: score(100 - maxWeight, 100) },
    { metric: "Winners", v: score(winners, Math.max(1, holdings.length)) },
    { metric: "Size", v: score(holdings.length, 12) },
  ] : [
    { metric: "Value", v: 0 }, { metric: "Growth", v: 0 }, { metric: "Diversity", v: 0 },
    { metric: "Stability", v: 0 }, { metric: "Winners", v: 0 }, { metric: "Size", v: 0 },
  ];

  return (
    <Card className="border-0 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-card to-primary/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Portfolio Health
        </h3>
        <span className="text-[0.625rem] text-muted-foreground font-medium">{hasHoldings ? `IRR · ${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%/yr` : "No holdings yet"}</span>
      </div>

      <div className="grid grid-cols-5 gap-3 items-center">
        <div className="col-span-3 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: "0.5625rem", fill: "hsl(var(--muted-foreground))" }} />
              <Radar dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={hasHoldings ? 0.35 : 0.08} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Metric label="Annualized IRR" value={hasHoldings ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : "—"} positive={hasHoldings && irr >= 0} />
          <Metric label="Diversity" value={hasHoldings ? `${sectorCount} sectors` : "—"} />
          <Metric label="Top weight" value={hasHoldings ? `${maxWeight.toFixed(0)}%` : "—"} positive={hasHoldings && maxWeight < 40} negative={hasHoldings && maxWeight > 50} />
          <Metric label="Winners" value={hasHoldings ? `${winners}/${holdings.length}` : "—"} positive={hasHoldings && winners >= holdings.length / 2} />
        </div>
      </div>
      {!hasHoldings && <p className="text-[0.625rem] text-muted-foreground mt-3">Add a holding to see your portfolio health scored here.</p>}
    </Card>
  );
}

function Metric({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const tone = positive ? "text-bull" : negative ? "text-bear" : "text-foreground";
  return (
    <div className="bg-background/60 rounded-xl px-2.5 py-1.5 border border-border/30">
      <p className="text-[0.5625rem] text-muted-foreground font-medium leading-none">{label}</p>
      <p className={`text-xs font-bold mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}
