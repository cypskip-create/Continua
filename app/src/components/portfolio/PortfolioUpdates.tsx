import { useState } from "react";
import { Info, ExternalLink, TrendingUp, DollarSign, FileText, AlertCircle } from "lucide-react";
import { InfoTip } from "./InfoTip";
import type { PortfolioUpdateItem, UpdateCategory } from "@/hooks/usePortfolioUpdates";

interface PortfolioUpdatesProps {
  items: PortfolioUpdateItem[];
  recentCounts: Record<UpdateCategory, number>;
  isLoading?: boolean;
}

const CATEGORIES: { key: UpdateCategory | "all"; label: string; icon: typeof TrendingUp }[] = [
  { key: "all", label: "All", icon: Info },
  { key: "earnings", label: "Earnings", icon: TrendingUp },
  { key: "dividends", label: "Dividends", icon: DollarSign },
  { key: "filings", label: "Company Filings", icon: FileText },
];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return new Date(iso).toLocaleDateString();
}

export function PortfolioUpdates({ items, recentCounts, isLoading }: PortfolioUpdatesProps) {
  const [filter, setFilter] = useState<UpdateCategory | "all">("all");

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <div className="card-gradient rounded-2xl p-4">
      <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
        Updates
        <InfoTip>Earnings and dividends come from Continua's structured data; filings are real NSE documents from the scraper that haven't been sorted by type yet.</InfoTip>
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Earnings and dividends are structured data; filings are real NSE documents Continua's scraper hasn't sorted by type yet.
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-3">
        {CATEGORIES.map((c) => {
          const count = c.key === "all"
            ? Object.values(recentCounts).reduce((a, b) => a + b, 0)
            : recentCounts[c.key];
          return (
            <button
              key={c.key}
              data-small-target
              onClick={() => setFilter(c.key)}
              className={`shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-semibold transition-colors ${
                filter === c.key ? "contrast-active" : "bg-muted/60 hover:bg-muted"
              }`}
            >
              <c.icon className="h-3 w-3" />
              {c.label}
              {count > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full ${filter === c.key ? "bg-background" : "bg-primary"}`} />
              )}
            </button>
          );
        })}
      </div>

      {isLoading && items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-6 text-center">Loading updates…</p>
      ) : filtered.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-6 text-center">Nothing here yet.</p>
      ) : (
        <div className="divide-y divide-border/40">
          {filtered.slice(0, 30).map((item) => (
            <a
              key={item.id}
              href={item.url ?? undefined}
              target={item.url ? "_blank" : undefined}
              rel={item.url ? "noopener noreferrer" : undefined}
              className={`flex gap-3 py-3 ${item.url ? "active:opacity-70 cursor-pointer" : ""}`}
            >
              <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0 text-[10px] font-bold">
                {item.symbol.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[12.5px] font-bold">{item.symbol}</p>
                  <span className="text-[10px] text-muted-foreground">· {timeAgo(item.date)}</span>
                  {item.needsReview && (
                    <span title="Company match not fully confirmed">
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] font-semibold mt-0.5">{item.title}</p>
                {item.detail && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.detail}</p>}
              </div>
              {item.url && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
