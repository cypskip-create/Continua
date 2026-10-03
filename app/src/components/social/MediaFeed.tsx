import { useMemo, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Newspaper } from "lucide-react";
import { useMarketNews } from "@/hooks/useMarketNews";
import { NewsReaderSheet } from "@/components/news/NewsReaderSheet";
import { NewsStoryCard } from "@/components/news/NewsStoryCard";
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
 * Real scraped news only — see docs/api/API.md's News section. Images
 * are the article's own og:image when the publisher set one (never
 * generated); no sentiment (never computed — fabricating Bullish/
 * Bearish on real articles would misrepresent them). Tapping a card
 * opens the in-app reader (NewsReaderSheet) with the real excerpt and
 * a clear link to the full story — only an excerpt is ever stored, not
 * the full body (reproducing full articles isn't something Continua is
 * licensed to do), so the reader is honest about that rather than
 * pretending to show the whole piece.
 */
export function MediaFeed({ searchQuery }: MediaFeedProps) {
  const [category, setCategory] = useState<NewsItem["category"] | "all">("all");
  const [readerItem, setReaderItem] = useState<NewsItem | null>(null);
  const { news, isLoading } = useMarketNews(category === "all" ? undefined : category);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return news;
    const q = searchQuery.toLowerCase();
    return news.filter((n) => n.headline.toLowerCase().includes(q) || n.excerpt?.toLowerCase().includes(q) || n.symbols.some((s) => s.toLowerCase().includes(q)));
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
            {searchQuery ? "Try a different company, topic, ticker, or category." : "No verified financial stories in this category yet — check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <NewsStoryCard key={item.id} item={item} onOpen={() => setReaderItem(item)} />
          ))}
        </div>
      )}

      <NewsReaderSheet item={readerItem} open={readerItem !== null} onOpenChange={(open) => !open && setReaderItem(null)} />
    </div>
  );
}
