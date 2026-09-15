import { useEffect, useMemo, useState } from "react";
import { Newspaper, Coins, BarChart3, ExternalLink, ChevronRight } from "lucide-react";
import { useFollowedNews } from "@/hooks/useFollowedNews";
import { useUpcomingDividends, useRecentEarnings } from "@/hooks/useMarketCalendars";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useNavigate } from "react-router-dom";

/**
 * The home page's "Updates" feed — Continua's own take on a unified
 * activity stream, not a copy of any other product's layout. Three real
 * data sources only, no fabricated sentiment/risk badges:
 *   - scraped news (useFollowedNews — per-holding when signed in with a
 *     portfolio/watchlist, general market feed otherwise)
 *   - upcoming dividends (real ex-dates from corporate actions)
 *   - recently reported earnings (real reported figures, never estimates)
 * Merged into one chronological list so a stock event and the headline
 * about it can sit next to each other, with lightweight type chips to
 * filter down to just one kind.
 */

type UpdateType = "news" | "dividend" | "earnings";

interface UpdateEvent {
  id: string;
  type: UpdateType;
  timestamp: string; // ISO — used for sorting + relative display
  title: string;
  subtitle: string;
  symbol?: string;
  url?: string;
}

const FILTERS: { id: UpdateType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "news", label: "News" },
  { id: "dividend", label: "Dividends" },
  { id: "earnings", label: "Earnings" },
];

const TYPE_STYLES: Record<UpdateType, { icon: typeof Newspaper; bg: string; fg: string }> = {
  news: { icon: Newspaper, bg: "bg-primary/10", fg: "text-primary" },
  dividend: { icon: Coins, bg: "bg-amber-500/10", fg: "text-amber-500" },
  earnings: { icon: BarChart3, bg: "bg-sky-500/10", fg: "text-sky-500" },
};

const LAST_SEEN_KEY = "continua:updates:lastSeenAt";

interface UpdatesFeedProps {
  followedSymbols: string[];
  limit?: number;
}

export function UpdatesFeed({ followedSymbols, limit = 12 }: UpdatesFeedProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<UpdateType | "all">("all");

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
        type: "news",
        timestamp: n.publishedAt as string,
        title: n.headline,
        subtitle: n.sourceName,
        symbol: n.symbols[0],
        url: n.articleUrl,
      }));

    const dividendEvents: UpdateEvent[] = dividends
      .filter((d) => relevant(d.symbol))
      .map((d) => ({
        id: `dividend-${d.id}`,
        type: "dividend",
        timestamp: d.announcedAt,
        title: `${d.companyName} — upcoming dividend`,
        subtitle: d.exDate ? `Ex-date ${formatTimestamp(d.exDate)}` : "Ex-date TBC",
        symbol: d.symbol,
      }));

    const earningsEvents: UpdateEvent[] = earnings
      .filter((e) => relevant(e.symbol))
      .map((e) => ({
        id: `earnings-${e.id}`,
        type: "earnings",
        timestamp: e.reportedDate,
        title: `${e.companyName} reported FY${e.fiscalYear}${e.fiscalQuarter ? ` Q${e.fiscalQuarter}` : ""}`,
        subtitle: e.epsActual != null ? `EPS ${e.epsActual.toFixed(2)}` : "Results filed",
        symbol: e.symbol,
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
    if (lastSeen) {
      setNewCount(events.filter((e) => e.timestamp > lastSeen).length);
    } else {
      setNewCount(0);
    }
    if (events.length > 0) {
      localStorage.setItem(LAST_SEEN_KEY, events[0].timestamp);
    }
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
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

      <div className="flex gap-1.5 pb-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
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

      <div className="border-t border-border/60">
        {filtered.map((e) => {
          const style = TYPE_STYLES[e.type];
          const Icon = style.icon;
          const content = (
            <div className="flex items-start gap-2.5 py-3 border-b border-border/40 -mx-4 px-4 transition-colors hover:bg-muted/30">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${style.fg}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-snug line-clamp-2">{e.title}</p>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">
                  {e.symbol && <span className="font-semibold text-foreground/80">${e.symbol} · </span>}
                  {e.subtitle} · {formatTimestamp(e.timestamp)}
                </p>
              </div>
              {e.url ? (
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
              )}
            </div>
          );

          return e.url ? (
            <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" data-small-target className="block">
              {content}
            </a>
          ) : (
            <button
              key={e.id}
              data-small-target
              onClick={() => e.symbol && navigate(`/stock/${e.symbol}`)}
              className="block w-full text-left"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}