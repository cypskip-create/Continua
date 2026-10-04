import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/formatTimestamp";
import type { NewsItem } from "@/api/types";
import type { Quote } from "@/api/types";

interface Props {
  item: NewsItem;
  onOpen: () => void;
  quotes?: Record<string, Quote>;
  onSymbolOpen?: (symbol: string) => void;
}

export function NewsStoryCard({ item, onOpen, quotes = {}, onSymbolOpen }: Props) {
  return (
    <div role="button" tabIndex={0} data-small-target onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }} className="block w-full border-b border-border/60 pb-3 text-left">
      <Card className="soft-card cursor-pointer overflow-hidden transition-opacity active:opacity-70">
        {item.imageUrl && <img src={item.imageUrl} alt="" className="h-36 w-full object-cover" />}
        <CardContent className="px-0 py-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[0.6875rem] font-semibold text-primary">{item.sourceName}</span>
            <span className="text-[0.6875rem] text-muted-foreground">{formatTimestamp(item.publishedAt)}</span>
          </div>
          <h2 className="mb-1.5 line-clamp-3 text-[0.8125rem] font-bold leading-snug">{item.headline}</h2>
          {item.excerpt && <p className="mb-2 line-clamp-2 text-[0.6875rem] leading-relaxed text-muted-foreground">{item.excerpt}</p>}
          {item.symbols.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.symbols.slice(0, 3).map((symbol) => {
                const quote = quotes[symbol.toUpperCase()];
                return (
                  <button type="button" key={symbol} onClick={(event) => { event.stopPropagation(); onSymbolOpen?.(symbol); }} className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/70 px-2 py-1 text-[0.625rem] font-semibold">
                    <span>${symbol}</span>
                    {quote && <><span className="tabular-nums">KES {quote.lastPrice.toFixed(2)}</span><span className={quote.changePercent >= 0 ? "text-bull" : "text-bear"}>{quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%</span></>}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
