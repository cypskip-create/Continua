import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, ArrowLeft } from "lucide-react";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useNavigate } from "react-router-dom";
import type { NewsItem } from "@/api/types";
import { useQuery } from "@tanstack/react-query";
import { newsApi } from "@/api/newsApi";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { useTouchClick } from "@/hooks/useTouchClick";

interface NewsReaderSheetProps {
  item: NewsItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full-screen reader. The lightweight feed opens instantly, then the detail
 * endpoint fills in the extracted article body without delaying the list.
 */
export function NewsReaderSheet({ item, open, onOpenChange }: NewsReaderSheetProps) {
  const navigate = useNavigate();
  if (!item) return null;
  return <NewsReaderContent item={item} open={open} onOpenChange={onOpenChange} navigate={navigate} />;
}

function NewsReaderContent({ item, open, onOpenChange, navigate }: NewsReaderSheetProps & { item: NewsItem; navigate: ReturnType<typeof useNavigate> }) {
  const closeTap = useTouchClick<HTMLButtonElement>();
  const detail = useQuery({
    queryKey: ["continua", "news", "detail", item.id],
    queryFn: () => newsApi.getById(item.id),
    enabled: open,
    staleTime: 0,
  });
  const article = detail.data ?? item;
  const linkedSymbols = article.relevance?.version === 2 ? article.relevance.evidence.map(e => e.symbol) : [];
  const { quotes } = useLiveQuotes(linkedSymbols);
  const body = article.content?.trim() || article.excerpt?.trim() || "";
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose fullScreen aria-describedby={undefined} className="!flex flex-col gap-0 overflow-hidden border-0 p-0">
        <DialogTitle className="sr-only">{article.headline}</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur-xl">
            <button {...closeTap} type="button" aria-label="Close article" onClick={() => onOpenChange(false)} className="inline-btn -ml-2 grid h-10 w-10 place-items-center rounded-full hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{article.sourceName}</p>
              <p className="text-[0.6875rem] text-muted-foreground">{formatTimestamp(article.publishedAt)}</p>
            </div>
          </header>
          <div
            className="min-h-0 flex-1 overflow-y-scroll overscroll-contain touch-pan-y"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
          >
          {article.imageUrl ? (
            <img src={article.imageUrl} alt="" className="w-full max-h-[42vh] min-h-52 object-cover" />
          ) : (
            <div className="w-full h-32 bg-muted/50 flex items-center justify-center">
              <Newspaper className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}

          <article className="mx-auto w-full max-w-2xl p-5 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{article.sourceName}</span>
              <span className="text-xs text-muted-foreground">{formatTimestamp(article.publishedAt)}</span>
            </div>

            <h2 className="mb-4 text-2xl font-bold leading-tight sm:text-3xl">{article.headline}</h2>

            {linkedSymbols.length > 0 && (
              <div className="mb-5 space-y-2">
                <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted-foreground">Companies linked to this story</p>
                <div className="flex flex-wrap gap-2">
                {linkedSymbols.map((s) => {
                  const quote = quotes[s.toUpperCase()];
                  return <button key={s} data-small-target onClick={() => { onOpenChange(false); navigate(`/stock/${s}`); }} className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-left">
                    <Badge variant="outline" className="rounded-full text-[0.625rem]">${s}</Badge>
                    {quote && <div><p className="text-xs font-bold tabular-nums">KES {quote.lastPrice.toFixed(2)}</p><p className={`text-[0.625rem] font-semibold ${quote.changePercent >= 0 ? "text-bull" : "text-bear"}`}>{quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%</p></div>}
                  </button>
                })}
                </div>
                {article.relevance?.evidence.map(e => <details key={e.symbol} className="border-b border-border/60 py-2 text-xs"><summary className="cursor-pointer font-semibold">Why {e.symbol}? · {e.basis === "headline" ? "Named in headline" : "Article evidence"}</summary><p className="mt-2 leading-relaxed text-muted-foreground">“{e.evidence}”</p></details>)}
                <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">A company mention is not proof of a price impact. The quote change is market data, not an effect attributed to this story.</p>
              </div>
            )}

            {detail.isLoading && !article.content && <p className="mb-4 animate-pulse text-sm text-muted-foreground">Loading article…</p>}
            <div className="space-y-4">
              {paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line text-base leading-8 text-foreground/90">{paragraph}</p>)}
            </div>
          </article>
          </div>
          <div className="shrink-0 border-t border-border/60 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <a
              href={article.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-small-target
              className="mx-auto flex h-12 w-full max-w-2xl items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              Read full story at {article.sourceName} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
