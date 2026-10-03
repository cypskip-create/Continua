import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/formatTimestamp";
import type { NewsItem } from "@/api/types";

export function NewsStoryCard({ item, onOpen }: { item: NewsItem; onOpen: () => void }) {
  return (
    <button type="button" data-small-target onClick={onOpen} className="block w-full text-left">
      <Card className="soft-card cursor-pointer overflow-hidden transition-opacity active:opacity-70">
        {item.imageUrl && <img src={item.imageUrl} alt="" className="h-36 w-full object-cover" />}
        <CardContent className="p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-primary">{item.sourceName}</span>
            <span className="text-[11px] text-muted-foreground">{formatTimestamp(item.publishedAt)}</span>
          </div>
          <h2 className="mb-1.5 line-clamp-3 text-[13px] font-bold leading-snug">{item.headline}</h2>
          {item.excerpt && <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{item.excerpt}</p>}
          {item.symbols.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {item.symbols.slice(0, 4).map((symbol) => <Badge key={symbol} variant="outline" className="rounded-full px-1.5 py-0 text-[9px]">${symbol}</Badge>)}
            </div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}
