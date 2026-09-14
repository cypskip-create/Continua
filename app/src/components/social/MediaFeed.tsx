import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink } from "lucide-react";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useMarketNews } from "@/hooks/useMarketNews";
import type { NewsItem } from "@/api/types";

interface MediaFeedProps {
  searchQuery: string;
}

/** Categories are the real ones the news bridge classifies into (see
 *  classifyNewsCategory.ts on the backend) — no "Interviews"/video
 *  category, since nothing in this pipeline scrapes video. */
const CATEGORIES: { id: NewsItem["category"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "markets", label: "Markets" },
  { id: "earnings", label: "Earnings" },
  { id: "companies", label: "Companies" },
  { id: "economy", label: "Economy" },
];

/**
 * Real scraped news only — see docs/api/API.md's News section. No images
 * (never scraped), no sentiment (never computed — fabricating Bullish/
 * Bearish on real articles would misrepresent them, worse than the old
 * mock badges), no video/breaking flags (no such source exists). Opens
 * the original article externally: only an excerpt is ever stored, not
 * the full body, so there's nothing to show in an in-app reader anyway.
 */
export function MediaFeed({ searchQuery }: MediaFeedProps) {
  const [category, setCategory] = useState<NewsItem["category"] | "all">("all");
  const { news, isLoading } = useMarketNews(category === "all" ? undefined : category);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return news;
    const q = searchQuery.toLowerCase();
    return news.filter((n) => n.headline.toLowerCase().includes(q) || n.symbols.some((s) => s.toLowerCase().includes(q)));
  }, [news, searchQuery]);

  return (
    <div className="px-4 pt-3 pb-6 space-y-4">
      {/* Category rail */}
      <ScrollArea className="w-full">
        <div className="flex gap-1.5 pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              data-small-target
              onClick={() => setCategory(c.id)}
              className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === c.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {isLoading ? (
        <div className="px-6 py-16 text-center">
          <p className="text-xs text-muted-foreground">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <Newspaper className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-bold">No stories yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {searchQuery ? "Try a different search or category." : "Nothing scraped for this category yet — check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <a key={item.id} href={item.articleUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Card className="soft-card cursor-pointer active:opacity-70 transition-opacity">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold text-primary">{item.sourceName}</span>
                    <span className="text-[11px] text-muted-foreground">{formatTimestamp(item.publishedAt)}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </div>
                  <h2 className="font-bold text-[13px] leading-snug line-clamp-3 mb-1.5">{item.headline}</h2>
                  {item.symbols.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.symbols.slice(0, 4).map((s) => (
                        <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0 rounded-full">${s}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}