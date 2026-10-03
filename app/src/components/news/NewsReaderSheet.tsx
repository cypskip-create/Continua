import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, ArrowLeft } from "lucide-react";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 data-[state=open]:slide-in-from-bottom-0 data-[state=closed]:slide-out-to-bottom-0">
        <DialogTitle className="sr-only">{item.headline}</DialogTitle>
        <div className="flex h-full flex-col bg-background">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur-xl">
            <button type="button" aria-label="Close article" onClick={() => onOpenChange(false)} className="inline-btn -ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.sourceName}</p>
              <p className="text-[11px] text-muted-foreground">{formatTimestamp(item.publishedAt)}</p>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto pb-28">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" className="w-full max-h-[42vh] min-h-52 object-cover" />
          ) : (
            <div className="w-full h-32 bg-muted/50 flex items-center justify-center">
              <Newspaper className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}

          <article className="mx-auto w-full max-w-2xl p-5 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{item.sourceName}</span>
              <span className="text-xs text-muted-foreground">{formatTimestamp(item.publishedAt)}</span>
            </div>

            <h2 className="mb-4 text-2xl font-bold leading-tight sm:text-3xl">{item.headline}</h2>

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
              <p className="mb-4 whitespace-pre-line text-base leading-7 text-foreground/90">{item.excerpt}</p>
            )}
          </article>
          </div>
          <div className="fixed inset-x-0 bottom-0 border-t border-border/60 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <a
              href={item.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-small-target
              className="mx-auto flex h-12 w-full max-w-2xl items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              Read full story at {item.sourceName} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
