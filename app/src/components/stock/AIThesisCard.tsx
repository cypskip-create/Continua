import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { ContinuaScores } from "@/components/stock/ContinuaScore";

interface Props {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: string | number;
  pe: string | number;
  eps: string | number;
  dividend: string | number;
  marketCap?: string;
  scores?: ContinuaScores;
  mode?: "thesis" | "news_summary" | "market_insight";
  headlines?: string[];
  title?: string;
}

export function AIThesisCard(props: Props) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThesis = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("stock-thesis", {
        body: {
          mode: props.mode || "thesis",
          symbol: props.symbol,
          name: props.name,
          sector: props.sector,
          price: props.price,
          changePercent: props.changePercent,
          pe: props.pe,
          eps: props.eps,
          dividend: props.dividend,
          marketCap: props.marketCap,
          scores: props.scores,
          headlines: props.headlines,
        },
      });
      if (error) throw error;
      setText(typeof data === "object" && data !== null && "text" in data && typeof data.text === "string" ? data.text : "No analysis available.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThesis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.symbol, props.mode]);

  return (
    <Card className="grouped-card border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {props.title || "AI Investment Thesis"}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={fetchThesis} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {loading && !text ? (
          <div className="space-y-2">
            <div className="h-3 bg-muted/60 rounded animate-pulse w-full" />
            <div className="h-3 bg-muted/60 rounded animate-pulse w-5/6" />
            <div className="h-3 bg-muted/60 rounded animate-pulse w-4/6" />
          </div>
        ) : error ? (
          <p className="text-xs text-bear">{error}</p>
        ) : (
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-foreground/90">{text}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">AI-generated. Not investment advice.</p>
      </CardContent>
    </Card>
  );
}
