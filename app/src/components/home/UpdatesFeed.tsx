import { useEffect, useMemo, useState } from "react";
import { Newspaper, Coins, BarChart3, ChevronRight, ChevronDown } from "lucide-react";
import { useFollowedNews } from "@/hooks/useFollowedNews";
import { useUpcomingDividends, useRecentEarnings } from "@/hooks/useMarketCalendars";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useNavigate } from "react-router-dom";
import { NewsReaderSheet } from "@/components/news/NewsReaderSheet";
import type { NewsItem } from "@/api/types";

/**
 * The home page's "Updates" feed — merges three real data sources into
 * one chronological stream, styled as boxed per-event cards (ticker
 * monogram + event label + headline + expandable description), the
 * layout language the person asked to match. The data underneath stays
 * Continua's own real pipeline output, nothing fabricated:
 *   - scraped news (useFollowedNews — per-holding when signed in with a
 *     portfolio/watchlist, general market feed otherwise) — tapping one
 *     opens the in-app reader (NewsReaderSheet), not an external tab
 *   - upcoming dividends (real ex-dates from corporate actions)
 *   - recently reported earnings (real reported figures, never estimates)
 * No like/comment counts here — there's no backend concept of engagement
 * on a scraped article or a corporate action, and inventing numbers would
 * misrepresent real data.
 */

type UpdateType = "news" | "dividend" | "earnings";

interface UpdateEvent {
  id: string;
  type: UpdateType;
  timestamp: string; // ISO — used for sorting + relative display
  symbol?: string;
  companyLabel: string; // ticker or company name shown next to the monogram
  eventLabel: string; // "News", "Upcoming Dividend", "Earnings Report"
  headline: string;
  description?: string | null;
  newsItem?: NewsItem; // present only for type === "news"
}

const FILTERS: { id: UpdateType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "news", label: "News" },
  { id: "dividend", label: "Dividends" },
  { id: "earnings", label: "Earnings" },
];

const TYPE_STYLES: Record<UpdateType, { icon: typeof Newspaper; bg: string; fg: string; label: string }> = {
  news: { icon: Newspaper, bg: "bg-primary/10", fg: "text-primary", label: "News" },
  dividend: { icon: Coins, bg: "bg-amber-500/10", fg: "text-amber-500", label: "Upcoming Dividend" },
  earnings: { icon: BarChart3, bg: "bg-sky-500/10", fg: "text-sky-500", label: "Earnings Report" },
};

const LAST_SEEN_KEY = "continua:updates:lastSeenAt";

interface UpdatesFeedProps {
  followedSymbols: string[];
  limit?: number;
}

export function UpdatesFeed({ followedSymbols, limit = 12 }: UpdatesFeedProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<UpdateType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readerItem, setReaderItem] = useState<NewsItem | null>(null);

  const { news } = useFollowedNews(followedSymbols, limit);
  const { dividends } = useUpcomingDividends();
  const { earnings } = useRecentEarnings();

  const events = useMemo<UpdateEvent[]>(() => {
    const followedSet = new Set(followedSymbols.map((s) => s.toUpperCase()));
    const relevant = (symbol: string) => followedSet.size === 0 || followedSet.has(symbol.toUpperCase());

    const newsEvents: UpdateEvent[] = news
      .filter((n) => n.publishedAt)
      .map((n) => ({
        id: `news-${n.id}`,
        type: "news" as const,
        timestamp: n.publishedAt as string,
        symbol: n.symbols[0],
        companyLabel: n.symbols[0] ? `$${n.symbols[0]}` : n.sourceName,
        eventLabel: n.sourceName,
        headline: n.headline,
        description: n.excerpt,
        newsItem: n,
      }));

    const dividendEvents: UpdateEvent[] = dividends
      .filter((d) => relevant(d.symbol))
      .map((d) => {
        const details = d.details as { amountPerShare?: number; currency?: string };
        return {
          id: `dividend-${d.id}`,
          type: "dividend" as const,
          timestamp: d.announcedAt,
          symbol: d.symbol,
          companyLabel: d.companyName,
          eventLabel: TYPE_STYLES.dividend.label,
          headline: `Upcoming dividend${details.amountPerShare != null ? ` of ${details.currency ?? "KES"} ${details.amountPerShare}` : ""} per share`,
          description: d.exDate ? `Ex-date ${formatTimestamp(d.exDate)}` : "Ex-date to be confirmed.",
        };
      });

    const earningsEvents: UpdateEvent[] = earnings
      .filter((e) => relevant(e.symbol))
      .map((e) => ({
        id: `earnings-${e.id}`,
        type: "earnings" as const,
        timestamp: e.reportedDate,
        symbol: e.symbol,
        companyLabel: e.companyName,
        eventLabel: TYPE_STYLES.earnings.label,
        headline: `FY${e.fiscalYear}${e.fiscalQuarter ? ` Q${e.fiscalQuarter}` : ""} results reported`,
        description: e.epsActual != null ? `Reported EPS of ${e.epsActual.toFixed(2)}.` : "Results filed with the exchange.",
      }));

    return [...newsEvents, ...dividendEvents, ...earningsEvents]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }, [news, dividends, earnings, followedSymbols, limit]);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

  // Lightweight "new since last visit" count — purely a local UI nicety,
  // not a synced read-state, so it's fine to key off localStorage.
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    setNewCount(lastSeen ? events.filter((e) => e.timestamp > lastSeen).length : 0);
    if (events.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, events[0].timestamp);
    }
  }, [events]);

  if (events.length === 0) return null;

  const handleTap = (e: UpdateEvent) => {
    if (e.type === "news" && e.newsItem) {
      setReaderItem(e.newsItem);
    } else if (e.symbol) {
      navigate(`/stock/${e.symbol}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-4">
        <div className="flex items-center gap-2">
          <p className="section-eyebrow">Updates</p>
          {newCount > 0 && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
              {newCount} new
            </span>
          )}
        </div>
        <button
          data-small-target
          onClick={() => navigate("/traders-hub?tab=media")}
          className="text-[11px] text-primary font-semibold flex items-center"
        >
          All <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-1.5 pb-3 px-4 overflow-x-auto scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            data-small-target
            onClick={() => setFilter(f.id)}
            className={`shrink-0 h-7 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
              filter === f.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-2">
        {filtered.map((e) => {
          const style = TYPE_STYLES[e.type];
          const Icon = style.icon;
          const isExpanded = expandedId === e.id;
          const hasImage = e.type === "news" && e.newsItem?.imageUrl;

          return (
            <div
              key={e.id}
              data-small-target
              onClick={() => handleTap(e)}
              className="rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer overflow-hidden"
            >
              {hasImage && (
                <img src={e.newsItem!.imageUrl!} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                    <Icon className={`h-3 w-3 ${style.fg}`} />
                  </div>
                  <span className="text-xs font-bold">{e.companyLabel}</span>
                  <span className={`text-[10px] font-semibold ${style.fg}`}>· {style.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{formatTimestamp(e.timestamp)}</span>
                </div>

                <p className="text-[13px] font-bold leading-snug mb-1">{e.headline}</p>

                {e.description && (
                  <>
                    <p className={`text-xs text-muted-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                      {e.description}
                    </p>
                    {e.description.length > 80 && e.type !== "news" && (
                      <button
                        data-small-target
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setExpandedId(isExpanded ? null : e.id);
                        }}
                        className="text-[11px] font-semibold text-primary flex items-center gap-0.5 mt-1"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <NewsReaderSheet item={readerItem} open={readerItem !== null} onOpenChange={(open) => !open && setReaderItem(null)} />
    </div>
  );
}