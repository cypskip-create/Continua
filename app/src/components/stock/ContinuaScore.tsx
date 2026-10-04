import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Activity, Shield, Coins, AlertTriangle, Trophy } from "lucide-react";

export interface ScoreInputs {
  price: number;
  pe: string | number;
  eps: string | number;
  dividend: string | number;
  changePercent: string | number;
  beta?: string | number;
  high52: string | number;
  low52: string | number;
  marketCap?: string;
}

export interface ContinuaScores {
  value: number;
  growth: number;
  health: number;
  dividend: number;
  risk: number;
  position: number;
  overall: number;
}

const num = (v: string | number | undefined): number => {
  if (v === undefined || v === null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? NaN : n;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function computeScores(s: ScoreInputs): ContinuaScores {
  const pe = num(s.pe);
  const eps = num(s.eps);
  const div = num(s.dividend);
  const beta = num(s.beta);
  const hi = num(s.high52);
  const lo = num(s.low52);
  const chg = num(s.changePercent);

  // Value: lower P/E is better (NSE avg ~10)
  const value = isNaN(pe) || pe <= 0 ? 50 : clamp(100 - (pe - 3) * 6);
  // Growth: positive eps + day momentum
  const growth = clamp((isNaN(eps) || eps <= 0 ? 30 : 50 + eps * 2) + (isNaN(chg) ? 0 : chg * 3));
  // Financial health: positive EPS, P/E in healthy band
  const health = clamp((eps > 0 ? 60 : 25) + (pe > 0 && pe < 15 ? 25 : 0) + (div > 0 ? 10 : 0));
  // Dividend: yield-driven
  const yld = !isNaN(div) && s.price > 0 ? (div / s.price) * 100 : 0;
  const dividend = clamp(yld * 12);
  // Risk: higher beta => more risk (lower score). Default beta=1 if unknown
  const b = isNaN(beta) ? 1 : beta;
  const risk = clamp(100 - (b - 0.5) * 60);
  // Position: where price sits in 52w range (higher = stronger)
  const position = !isNaN(hi) && !isNaN(lo) && hi > lo
    ? clamp(((s.price - lo) / (hi - lo)) * 100)
    : 50;

  const overall = Math.round((value + growth + health + dividend + risk + position) / 6);
  return {
    value: Math.round(value),
    growth: Math.round(growth),
    health: Math.round(health),
    dividend: Math.round(dividend),
    risk: Math.round(risk),
    position: Math.round(position),
    overall,
  };
}

const scoreColor = (n: number) =>
  n >= 70 ? "text-bull" : n >= 50 ? "text-accent" : n >= 30 ? "text-chart-3" : "text-bear";

const scoreBg = (n: number) =>
  n >= 70 ? "bg-bull" : n >= 50 ? "bg-accent" : n >= 30 ? "bg-chart-3" : "bg-bear";

const overallLabel = (n: number) =>
  n >= 75 ? "Strong" : n >= 60 ? "Solid" : n >= 45 ? "Mixed" : n >= 30 ? "Weak" : "Poor";

export function ContinuaScoreCard({ scores }: { scores: ContinuaScores }) {
  const items = [
    { key: "value", label: "Value", icon: Coins, v: scores.value },
    { key: "growth", label: "Growth", icon: TrendingUp, v: scores.growth },
    { key: "health", label: "Health", icon: Shield, v: scores.health },
    { key: "dividend", label: "Dividend", icon: Coins, v: scores.dividend },
    { key: "risk", label: "Risk", icon: AlertTriangle, v: scores.risk },
    { key: "position", label: "Position", icon: Trophy, v: scores.position },
  ];

  // Build hexagonal radar SVG
  const cx = 60, cy = 60, r = 48;
  const points = items.map((it, i) => {
    const angle = (Math.PI * 2 * i) / items.length - Math.PI / 2;
    const dist = (it.v / 100) * r;
    return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = items.map((_, i) => {
      const a = (Math.PI * 2 * i) / items.length - Math.PI / 2;
      return `${cx + Math.cos(a) * r * f},${cy + Math.sin(a) * r * f}`;
    });
    return `M${pts.join(" L")} Z`;
  });

  return (
    <Card className="soft-card overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-semibold">
              Continua Score
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-3xl font-bold ${scoreColor(scores.overall)}`}>
                {scores.overall}
              </span>
              <span className="text-xs text-muted-foreground">/100 · {overallLabel(scores.overall)}</span>
            </div>
          </div>
          <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
            {grid.map((g, i) => (
              <path key={i} d={g} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.6" />
            ))}
            <path d={path} fill="hsl(var(--primary))" fillOpacity="0.25" stroke="hsl(var(--primary))" strokeWidth="1.5" />
            {points.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2" fill="hsl(var(--primary))" />
            ))}
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          {items.map((it) => (
            <div key={it.key} className="flat-section bg-muted/30 rounded-xl p-2">
              <div className="flex items-center gap-1 mb-1">
                <it.icon className={`h-3 w-3 ${scoreColor(it.v)}`} />
                <span className="text-[0.625rem] font-medium text-muted-foreground">{it.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-bold ${scoreColor(it.v)}`}>{it.v}</span>
                <span className="text-[0.5625rem] text-muted-foreground">/100</span>
              </div>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div className={`h-full ${scoreBg(it.v)} rounded-full transition-all`} style={{ width: `${it.v}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
