import { Card, CardContent } from "@/components/ui/card";
import { Shield, TrendingUp, TrendingDown, PieChart, AlertTriangle } from "lucide-react";

interface Holding {
  symbol: string;
  shares: number;
  avg_cost: number;
  sector?: string | null;
}

interface Props {
  holdings: Holding[];
  prices: Record<string, number>;
}

export function PortfolioInsights({ holdings, prices }: Props) {
  if (!holdings.length) return null;

  const positions = holdings.map((h) => {
    const price = prices[h.symbol] || h.avg_cost;
    const value = price * h.shares;
    const cost = h.avg_cost * h.shares;
    return { ...h, price, value, cost, gainPct: ((price - h.avg_cost) / h.avg_cost) * 100 };
  });

  const totalValue = positions.reduce((s, p) => s + p.value, 0);

  // Diversification — number of distinct holdings + sector spread
  const sectors = new Set(positions.map((p) => p.sector || "Unknown"));
  const distinct = positions.length;
  const diversityScore = Math.min(100, Math.round(distinct * 10 + sectors.size * 12));

  // Concentration — largest holding %
  const top = positions.reduce((a, b) => (a.value > b.value ? a : b));
  const topPct = (top.value / totalValue) * 100;
  const concentrationRisk = topPct > 40 ? "High" : topPct > 25 ? "Medium" : "Low";

  // Sector concentration
  const sectorTotals: Record<string, number> = {};
  positions.forEach((p) => {
    const s = p.sector || "Unknown";
    sectorTotals[s] = (sectorTotals[s] || 0) + p.value;
  });
  const topSector = Object.entries(sectorTotals).sort((a, b) => b[1] - a[1])[0];
  const topSectorPct = (topSector[1] / totalValue) * 100;

  // Gainers / losers
  const sorted = [...positions].sort((a, b) => b.gainPct - a.gainPct);
  const biggestGain = sorted[0];
  const biggestLoss = sorted[sorted.length - 1];

  // Risk score (lower = safer): based on concentration + sector concentration
  const riskScore = Math.round((topPct + topSectorPct) / 2);
  const riskLevel = riskScore > 50 ? "High" : riskScore > 30 ? "Moderate" : "Low";

  const insights = [
    {
      icon: PieChart,
      label: "Diversification",
      value: `${diversityScore}/100`,
      sub: `${distinct} stocks · ${sectors.size} sectors`,
      tone: diversityScore >= 60 ? "text-bull" : "text-chart-3",
    },
    {
      icon: AlertTriangle,
      label: "Concentration",
      value: concentrationRisk,
      sub: `${top.symbol} = ${topPct.toFixed(0)}%`,
      tone:
        concentrationRisk === "High"
          ? "text-bear"
          : concentrationRisk === "Medium"
          ? "text-chart-3"
          : "text-bull",
    },
    {
      icon: Shield,
      label: "Risk Level",
      value: riskLevel,
      sub: `${topSector[0]} = ${topSectorPct.toFixed(0)}%`,
      tone: riskLevel === "High" ? "text-bear" : riskLevel === "Moderate" ? "text-chart-3" : "text-bull",
    },
  ];

  return (
    <Card className="soft-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Smart Insights</h3>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {insights.map((i) => (
            <div key={i.label} className="flat-section bg-muted/30 rounded-xl p-2.5">
              <div className="flex items-center gap-1 mb-1">
                <i.icon className={`h-3 w-3 ${i.tone}`} />
                <span className="text-[0.625rem] font-medium text-muted-foreground">{i.label}</span>
              </div>
              <p className={`text-sm font-bold ${i.tone}`}>{i.value}</p>
              <p className="text-[0.625rem] text-muted-foreground mt-0.5 truncate">{i.sub}</p>
            </div>
          ))}
        </div>

        {(biggestGain.gainPct > 0 || biggestLoss.gainPct < 0) && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {biggestGain.gainPct > 0 ? (
              <div className="flat-section rounded-xl p-2.5 bg-bull/10">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-bull" />
                  <span className="text-[0.625rem] font-medium text-muted-foreground">Biggest Gainer</span>
                </div>
                <p className="text-sm font-bold mt-0.5 text-bull">
                  {biggestGain.symbol} +{biggestGain.gainPct.toFixed(1)}%
                </p>
              </div>
            ) : <div />}
            {biggestLoss.gainPct < 0 ? (
              <div className="flat-section rounded-xl p-2.5 bg-bear/10">
                <div className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-bear" />
                  <span className="text-[0.625rem] font-medium text-muted-foreground">Biggest Loser</span>
                </div>
                <p className="text-sm font-bold mt-0.5 text-bear">
                  {biggestLoss.symbol} {biggestLoss.gainPct.toFixed(1)}%
                </p>
              </div>
            ) : <div />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
