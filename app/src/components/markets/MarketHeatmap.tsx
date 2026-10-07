import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MarketIntelligence } from "@/api/marketResearchApi";
import type { Quote } from "@/api/types";
export function MarketHeatmap({
  sectors,
  quotes,
  compact = false,
}: {
  sectors: MarketIntelligence["sectors"];
  quotes: Quote[];
  compact?: boolean;
}) {
  const [mode, setMode] = useState("Sectors");
  const navigate = useNavigate();
  const items =
    mode === "Sectors"
      ? sectors.map((s) => ({
          id: s.name,
          label: s.name,
          change: s.changePercent,
          detail: `${s.coverage} issuers`,
          route: `/sector/${encodeURIComponent(s.name)}`,
        }))
      : quotes
          .filter((q) => Number.isFinite(q.changePercent) && q.lastPrice > 0)
          .map((q) => ({
            id: q.symbol,
            label: q.symbol,
            change: q.changePercent,
            detail: `KES ${q.lastPrice.toFixed(2)}`,
            route: `/stock/${q.symbol}`,
          }));
  return (
    <>
      <div className="market-choices">
        {["Sectors", "Companies"].map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            className={`pill-tab ${m === mode ? "contrast-active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px my-4">
        {items.slice(0, compact ? 6 : 200).map((i) => (
          <button
            key={i.id}
            className="text-left min-h-28 p-4"
            style={{
              background: `hsl(var(--${i.change > 0 ? "bull" : i.change < 0 ? "bear" : "muted-foreground"}) / ${Math.min(0.24, 0.06 + Math.abs(i.change) * 0.025)})`,
            }}
            onClick={() => navigate(i.route)}
          >
            <p>{i.label}</p>
            <p
              className={`text-xl my-2 ${i.change > 0 ? "text-bull" : i.change < 0 ? "text-bear" : "text-muted-foreground"}`}
            >
              {i.change > 0 ? "+" : ""}
              {i.change.toFixed(2)}%
            </p>
            <small>{i.detail}</small>
          </button>
        ))}
      </div>
      {!items.length && (
        <p className="market-empty">
          No published quotes are available for this map.
        </p>
      )}
      <p className="market-note">
        Equal-size tiles; colour intensity reflects session change, not market
        capitalization. Sector changes are equal-weight averages of covered
        issuers.
      </p>
    </>
  );
}
