import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Newspaper, ExternalLink, ChevronRight } from "lucide-react";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { useQuery } from "@tanstack/react-query";
import { announcementsApi } from "@/api/announcementsApi";
import { useSecurityNews } from "@/hooks/useSecurityNews";
import { InfoTip } from "@/components/portfolio/InfoTip";
import { Link } from "react-router-dom";
import { mediaStoryUrl } from "@/lib/mediaRoute";

interface Props {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: string;
  pe: string; eps: string; dividend: string;
}

export function NewsEventsTab(props: Props) {
  const { symbol } = props;
  const filingsQuery = useQuery({
    queryKey: ["continua", "announcements", symbol, "news-tab"],
    queryFn: () => announcementsApi.getForSymbol(symbol, { limit: 8 }),
    enabled: !!symbol,
    staleTime: 15 * 60_000,
  });
  const filings = filingsQuery.data ?? [];
  const { news, isLoading: newsLoading } = useSecurityNews(symbol);

  return (
    <div className="space-y-3">
      <Card className="soft-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <h4 className="text-xs font-bold flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-primary" />Recent Company Filings</h4>
            <InfoTip>Real NSE announcements bridged from Continua's scraper — not a predicted events calendar, since Continua doesn't have a reliable forward corporate-calendar source yet.</InfoTip>
          </div>
          {filingsQuery.isLoading ? (
            <p className="text-[0.6875rem] text-muted-foreground py-2">Loading…</p>
          ) : filings.length === 0 ? (
            <p className="text-[0.6875rem] text-muted-foreground py-2">No filings on file for {symbol} yet.</p>
          ) : (
            <div className="space-y-2">
              {filings.map((f) => (
                <a
                  key={f.id}
                  href={f.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flat-section flex items-start gap-3 p-2 rounded-xl bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium line-clamp-2">{f.title}</p>
                    <p className="text-[0.625rem] text-muted-foreground mt-0.5">{f.publishedAt ? formatTimestamp(f.publishedAt) : "Date unknown"}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
          <h4 className="text-xs font-bold flex items-center gap-1.5"><Newspaper className="h-3.5 w-3.5 text-primary" />Latest Headlines</h4>
          <InfoTip>Real headlines scraped from Kenyan business news feeds and matched to {symbol} by keyword — not a curated editorial feed, so coverage depends on what those feeds have published recently.</InfoTip>
        </div>
        {newsLoading ? (
          <Card className="soft-card">
            <CardContent className="p-4 text-center text-[0.6875rem] text-muted-foreground">Loading…</CardContent>
          </Card>
        ) : news.length === 0 ? (
          <Card className="soft-card">
            <CardContent className="p-4 text-center text-[0.6875rem] text-muted-foreground">
              No recent headlines for {symbol} yet.
            </CardContent>
          </Card>
        ) : (
          news.map(n => (
            <Link key={n.id} to={mediaStoryUrl(n.id)}>
              <Card className="soft-card cursor-pointer active:opacity-70 transition-opacity">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
                    <Newspaper className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold line-clamp-2">{n.headline}</p>
                    <p className="text-[0.625rem] text-muted-foreground mt-0.5">{n.sourceName} · {n.publishedAt ? formatTimestamp(n.publishedAt) : "Date unknown"}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
