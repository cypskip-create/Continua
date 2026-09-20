import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink } from "lucide-react";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useNavigate } from "react-router-dom";
import type { NewsItem } from "@/api/types";

interface NewsReaderSheetProps {
  item: NewsItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The in-app "reader" for a scraped article. This is NOT a full-article
 * view — only an excerpt (~400 chars) is ever stored, never the complete
 * body (see NewsItem's header comment: reproducing full articles isn't
 * something Continua is licensed to do). What this sheet gives you over
 * just opening the link directly is a proper in-app moment — a real
 * thumbnail when the publisher provided one, the full headline, the
 * excerpt, and the ticker mentions — before handing off to the original
 * source for the complete story. No fabricated body copy, comments, or
 * view counts; those would misrepresent a real scraped article.
 */
export function NewsReaderSheet({ item, open, onOpenChange }: NewsReaderSheetProps) {
  const navigate = useNavigate();
  if (!item) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerTitle className="sr-only">{item.headline}</DrawerTitle>
        <div className="overflow-y-auto">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="w-full h-48 object-cover" />
          ) : (
            <div className="w-full h-32 bg-muted/50 flex items-center justify-center">
              <Newspaper className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}

          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{item.sourceName}</span>
              <span className="text-xs text-muted-foreground">{formatTimestamp(item.publishedAt)}</span>
            </div>

            <h2 className="text-base font-bold leading-snug mb-3">{item.headline}</h2>

            {item.symbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {item.symbols.map((s) => (
                  <button key={s} data-small-target onClick={() => { onOpenChange(false); navigate(`/stock/${s}`); }}>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full cursor-pointer hover:bg-primary/10">
                      ${s}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {item.excerpt && (
              <p className="text-sm leading-relaxed text-foreground/90 mb-4">{item.excerpt}…</p>
            )}

            <a
              href={item.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-small-target
              className="flex items-center justify-center gap-1.5 w-full h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
            >
              Read full story at {item.sourceName} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}