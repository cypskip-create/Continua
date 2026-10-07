import { useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIndicator } from "@/hooks/useIndicator";
import { useVolumeProfile } from "@/hooks/useVolumeProfile";
import { useBacktest } from "@/hooks/useBacktest";
import type { BacktestStrategy } from "@/api/backtestApi";
import { fx } from "@/lib/chartPalette";

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{children}</p>
);

interface Props {
  symbol: string;
  currency: string;
}

export function TechnicalsTab({ symbol, currency }: Props) {
  return (
    <div className="space-y-8">
      <IndicatorReadouts symbol={symbol} />
      <VolumeProfileSection symbol={symbol} currency={currency} />
      <BacktesterSection symbol={symbol} />
    </div>
  );
}

// ── Indicator readouts ─────────────────────────────────────────────────

function IndicatorReadouts({ symbol }: { symbol: string }) {
  const { indicator: rsi, isLoading: rsiLoading } = useIndicator(symbol, "RSI", { period: 14 });
  const { indicator: sma20, isLoading: sma20Loading } = useIndicator(symbol, "SMA", { period: 20 });
  const { indicator: sma50, isLoading: sma50Loading } = useIndicator(symbol, "SMA", { period: 50 });
  const { indicator: macd, isLoading: macdLoading } = useIndicator(symbol, "MACD", {});

  const rsiValue = typeof rsi?.latest === "number" ? rsi.latest : null;
  const sma20Value = typeof sma20?.latest === "number" ? sma20.latest : null;
  const sma50Value = typeof sma50?.latest === "number" ? sma50.latest : null;
  const macdLatest = macd?.latest && typeof macd.latest === "object" ? macd.latest : null;

  const rsiState = rsiValue == null ? null : rsiValue >= 70 ? "Overbought" : rsiValue <= 30 ? "Oversold" : "Neutral";
  const rsiColor = rsiState === "Overbought" ? fx.weak : rsiState === "Oversold" ? fx.strong : fx.ok;

  const smaCross = sma20Value != null && sma50Value != null ? (sma20Value > sma50Value ? "bullish" : sma20Value < sma50Value ? "bearish" : "flat") : null;

  const isLoading = rsiLoading || sma20Loading || sma50Loading || macdLoading;

  return (
    <div>
      <Eyebrow>Indicators</Eyebrow>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading indicators…
        </div>
      ) : (
        <div className="border-t border-border/60 divide-y divide-border/40">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-semibold">RSI (14)</p>
              <p className="text-[0.625rem] text-muted-foreground">Relative Strength Index</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular">{rsiValue != null ? rsiValue.toFixed(1) : "—"}</p>
              {rsiState && <Badge variant="outline" className="text-[0.5625rem]" style={{ color: rsiColor, borderColor: `${rsiColor}55` }}>{rsiState}</Badge>}
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-semibold">SMA 20 vs SMA 50</p>
              <p className="text-[0.625rem] text-muted-foreground">Trend crossover</p>
            </div>
            <div className="text-right flex items-center gap-1.5">
              {smaCross === "bullish" && <><TrendingUp className="h-3.5 w-3.5" style={{ color: fx.strong }} /><span className="text-xs font-semibold" style={{ color: fx.strong }}>Bullish</span></>}
              {smaCross === "bearish" && <><TrendingDown className="h-3.5 w-3.5" style={{ color: fx.weak }} /><span className="text-xs font-semibold" style={{ color: fx.weak }}>Bearish</span></>}
              {smaCross === "flat" && <><Minus className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground">Flat</span></>}
              {smaCross == null && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-semibold">MACD (12, 26, 9)</p>
              <p className="text-[0.625rem] text-muted-foreground">Histogram: MACD line minus signal</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular">{macdLatest?.histogram != null ? macdLatest.histogram.toFixed(3) : "—"}</p>
              {macdLatest?.histogram != null && (
                <Badge variant="outline" className="text-[0.5625rem]" style={{ color: macdLatest.histogram >= 0 ? fx.strong : fx.weak, borderColor: `${macdLatest.histogram >= 0 ? fx.strong : fx.weak}55` }}>
                  {macdLatest.histogram >= 0 ? "Bullish" : "Bearish"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">Latest indicator date: {rsi?.timestamps?.at(-1)??"unavailable"}. RSI extremes and moving-average alignment are observations, not standalone buy/sell instructions. Confirm volume, reporting news and the price-history adjustment basis.</p>
      {sma20Value!=null&&sma50Value!=null&&sma50Value>0&&<p className="text-xs mt-1">20-day average relative to 50-day: {((sma20Value/sma50Value-1)*100).toFixed(2)}%.</p>}
    </div>
  );
}

// ── Volume profile ──────────────────────────────────────────────────────

function VolumeProfileSection({ symbol, currency }: { symbol: string; currency: string }) {
  const { profile, isLoading } = useVolumeProfile(symbol);

  if (isLoading) {
    return (
      <div>
        <Eyebrow>Volume Profile (90 days)</Eyebrow>
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/60 pt-3">
          <Loader2 className="h-3 w-3 animate-spin" /> Building volume profile…
        </div>
      </div>
    );
  }
  if (!profile) {
    return (
      <div>
        <Eyebrow>Volume Profile (90 days)</Eyebrow>
        <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">Not enough candle history on file for {symbol} yet.</p>
      </div>
    );
  }

  const maxVolume = Math.max(...profile.buckets.map((b) => b.volume), 1);
  // Highest price bucket first, so it reads top-to-bottom like a price axis.
  const orderedBuckets = [...profile.buckets].reverse();

  return (
    <div>
      <Eyebrow>Volume Profile (90 days)</Eyebrow>
      <div className="border-t border-border/60 pt-3">
        <div className="flex items-center justify-between mb-3 text-[0.625rem] text-muted-foreground">
          <span>Point of control: <span className="font-semibold text-foreground tabular">{currency} {profile.pointOfControl.toFixed(2)}</span></span>
          <span>Value area: <span className="font-semibold text-foreground tabular">{currency} {profile.valueAreaLow.toFixed(2)}–{profile.valueAreaHigh.toFixed(2)}</span></span>
        </div>
        <div className="space-y-0.5">
          {orderedBuckets.map((b) => {
            const widthPct = Math.max(2, (b.volume / maxVolume) * 100);
            const inValueArea = b.priceMid >= profile.valueAreaLow && b.priceMid <= profile.valueAreaHigh;
            const isPoc = Math.abs(b.priceMid - profile.pointOfControl) < 1e-6;
            return (
              <div key={`${b.priceLow}-${b.priceHigh}`} className="flex items-center gap-2 h-4">
                <span className="text-[0.5625rem] tabular text-muted-foreground w-14 text-right shrink-0">{b.priceMid.toFixed(1)}</span>
                <div className="flex-1 h-full bg-muted/30 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: isPoc ? fx.strong : inValueArea ? `${fx.strong}88` : `${fx.strong}33`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[0.625rem] text-muted-foreground mt-3">{profile.caveat}</p>
      </div>
    </div>
  );
}

// ── Backtester ───────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
  sma_cross: "SMA Crossover",
  ema_cross: "EMA Crossover",
  rsi_reversion: "RSI Mean-Reversion",
};

function BacktesterSection({ symbol }: { symbol: string }) {
  const [strategy, setStrategy] = useState<BacktestStrategy>("sma_cross");
  const [months, setMonths] = useState(12);
  const [feeBps,setFeeBps]=useState(20);
  const [slippageBps,setSlippageBps]=useState(10);
  const { runBacktest, result, isRunning, isError, error } = useBacktest();

  const handleRun = () => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    runBacktest({ symbol, strategy, feeBps, slippageBps, from: from.toISOString(), to: to.toISOString() });
  };

  return (
    <div>
      <Eyebrow>Strategy Backtester</Eyebrow><div className="flex flex-wrap gap-3 py-3 text-xs"><label>Fee (basis points)<input aria-label="Backtest fee basis points" className="ml-2 w-16 border border-border bg-background rounded px-2 py-1" type="number" min={0} max={500} value={feeBps} onChange={e=>setFeeBps(Number(e.target.value))}/></label><label>Slippage (basis points)<input aria-label="Backtest slippage basis points" className="ml-2 w-16 border border-border bg-background rounded px-2 py-1" type="number" min={0} max={500} value={slippageBps} onChange={e=>setSlippageBps(Number(e.target.value))}/></label></div>
      <div className="border-t border-border/60 pt-3 space-y-3">
        <div className="flex items-center gap-2">
          <Select value={strategy} onValueChange={(v) => setStrategy(v as BacktestStrategy)}>
            <SelectTrigger className="h-9 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STRATEGY_LABELS) as BacktestStrategy[]).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{STRATEGY_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="h-9 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 6, 12, 24].map((m) => <SelectItem key={m} value={String(m)} className="text-xs">{m}mo</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleRun} disabled={isRunning} className="h-9 shrink-0">
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {isError && <p className="text-xs text-bear">{error instanceof Error ? error.message : "Backtest failed — not enough history for this range."}</p>}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Strategy Return" value={`${result.metrics.totalReturnPercent >= 0 ? "+" : ""}${result.metrics.totalReturnPercent.toFixed(1)}%`} positive={result.metrics.totalReturnPercent >= 0} />
              <StatBox label="Buy & Hold Return" value={`${result.metrics.buyHoldReturnPercent >= 0 ? "+" : ""}${result.metrics.buyHoldReturnPercent.toFixed(1)}%`} positive={result.metrics.buyHoldReturnPercent >= 0} />
              <StatBox label="Win Rate" value={result.metrics.winRate != null ? `${result.metrics.winRate.toFixed(0)}%` : "—"} />
              <StatBox label="Max Drawdown" value={`-${result.metrics.maxDrawdownPercent.toFixed(1)}%`} positive={false} />
            </div>
            <p className="text-[0.625rem] text-muted-foreground">{result.metrics.totalTrades} trade{result.metrics.totalTrades === 1 ? "" : "s"} · {result.caveat}</p>

            {result.trades.length > 0 && (
              <div className="border-t border-border/40 divide-y divide-border/30">
                {result.trades.slice(-5).reverse().map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="text-[0.625rem] text-muted-foreground">{new Date(t.entryDate).toLocaleDateString()} → {new Date(t.exitDate).toLocaleDateString()}</span>
                    <span className={`text-xs font-semibold tabular ${t.returnPercent >= 0 ? "text-bull" : "text-bear"}`}>{t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? undefined : positive ? fx.strong : fx.weak;
  return (
    <div className="bg-muted/30 rounded-lg p-2.5">
      <p className="text-[0.5625rem] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold tabular" style={color ? { color } : undefined}>{value}</p>
    </div>
  );
}
