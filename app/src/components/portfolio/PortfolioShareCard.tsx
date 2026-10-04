import { forwardRef, useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

/**
 * Reads the *actual computed* HSL triplets for a handful of CSS custom
 * properties off :root right now, instead of leaving `hsl(var(--x))`
 * references in the card's inline style.
 *
 * Why: html-to-image (used by SharePortfolioDialog to turn this card into a
 * PNG) clones this node into an SVG <foreignObject> for rasterization. On
 * WebKit (iOS Safari / iOS WebViews) that foreignObject renderer doesn't
 * reliably support the modern comma-less `hsl(H S% L% / A)` syntax with a
 * slash-separated alpha — it silently treats it as an invalid color, which
 * paints as solid black. That's the dark diagonal "shadow" across the top of
 * downloaded/shared images, and it also breaks the AMOLED palette in
 * exports, since the fallback has nothing to do with the active theme.
 *
 * The fix here goes one step further than just resolving the variables: we
 * convert the resolved HSL all the way down to a plain `rgb(r, g, b)` string
 * (with any translucency pre-blended against the card color in JS, not left
 * as a CSS alpha channel). Plain comma-syntax rgb() has universal support,
 * on-screen and in every rasterization path, so nothing here can render as
 * an unsupported color again.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function parseHslTriplet(value: string): [number, number, number] {
  const [h, s, l] = value.split(" ").map(part => parseFloat(part));
  return [h || 0, s || 0, l || 0];
}

function blend(a: [number, number, number], b: [number, number, number], aWeight: number): [number, number, number] {
  return [
    Math.round(a[0] * aWeight + b[0] * (1 - aWeight)),
    Math.round(a[1] * aWeight + b[1] * (1 - aWeight)),
    Math.round(a[2] * aWeight + b[2] * (1 - aWeight)),
  ];
}

function useResolvedThemeColors() {
  const [colors, setColors] = useState({ primary: "252 70% 52%", primaryForeground: "0 0% 100%", card: "0 0% 100%", border: "220 13% 91%", muted: "220 14% 96%", isAmoled: false });

  useEffect(() => {
    const read = () => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      setColors({
        primary: styles.getPropertyValue("--primary").trim() || "252 70% 52%",
        primaryForeground: styles.getPropertyValue("--primary-foreground").trim() || "0 0% 100%",
        card: styles.getPropertyValue("--card").trim() || "0 0% 100%",
        border: styles.getPropertyValue("--border").trim() || "220 13% 91%",
        muted: styles.getPropertyValue("--muted").trim() || "220 14% 96%",
        isAmoled: root.classList.contains("amoled"),
      });
    };
    read();
    // Theme can change (light/dark/amoled toggle) without this component
    // remounting, since it can stay open across a theme switch.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export interface ShareableHolding {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  avgCost: number;
  dayChangePct: number;
  gainPct: number;
}

export interface PortfolioShareCardProps {
  displayName: string;
  totalValue: number;
  totalGain: number;
  gainPercent: number;
  todayGain: number;
  todayPercent: number;
  holdings: ShareableHolding[];
  hideAmounts: boolean;
  hideGains: boolean;
  topHoldingsOnly: boolean;
  showDayChange: boolean;
}

const kes = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Pure presentational — no data fetching. forwardRef so the share dialog can
 * point html-to-image at this exact DOM node for the download/native-share
 * actions, while the same component doubles as the live preview.
 */
export const PortfolioShareCard = forwardRef<HTMLDivElement, PortfolioShareCardProps>(
  ({ displayName, totalValue, totalGain, gainPercent, todayGain, todayPercent, holdings, hideAmounts, hideGains, topHoldingsOnly, showDayChange }, ref) => {
    const shown = topHoldingsOnly ? holdings.slice(0, 5) : holdings;
    const primaryGain = showDayChange ? todayGain : totalGain;
    const primaryPct = showDayChange ? todayPercent : gainPercent;
    const { primary, primaryForeground, card, border, muted, isAmoled } = useResolvedThemeColors();
    // AMOLED keeps every surface flat true-black-or-near-black (see index.css
    // "AMOLED consistency") — no lifted gradients — so the card matches the
    // rest of the app instead of standing out with a violet-tinted sheen.
    const cardRgb = hslToRgb(...parseHslTriplet(card));
    const primaryRgb = hslToRgb(...parseHslTriplet(primary));
    const primaryForegroundRgb = hslToRgb(...parseHslTriplet(primaryForeground));
    const borderRgb = hslToRgb(...parseHslTriplet(border));
    const mutedRgb = hslToRgb(...parseHslTriplet(muted));
    // Every one of these is a translucent color over the card in the original
    // design (an alpha channel) — pre-blended here into solid rgb() so nothing
    // in this card depends on the renderer supporting CSS alpha colors.
    const tintedRgb = blend(primaryRgb, cardRgb, 0.08);
    const borderOnCardRgb = blend(borderRgb, cardRgb, 0.6);
    const footerBgRgb = blend(mutedRgb, cardRgb, 0.2);
    const cardBackground = isAmoled
      ? `rgb(${cardRgb.join(", ")})`
      : `linear-gradient(165deg, rgb(${tintedRgb.join(", ")}), rgb(${cardRgb.join(", ")}) 55%)`;
    const rgb = (c: [number, number, number]) => `rgb(${c.join(", ")})`;

    return (
      <div
        ref={ref}
        className="w-[360px] rounded-3xl overflow-hidden"
        style={{ background: cardBackground, border: `1px solid ${rgb(borderRgb)}` }}
      >
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-md flex items-center justify-center text-[0.75rem] font-bold" style={{ background: rgb(primaryRgb), color: rgb(primaryForegroundRgb) }}>C</div>
              <span className="text-[0.8125rem] font-bold tracking-tight">Continua</span>
            </div>
            <span className="text-[0.625rem] font-mono text-muted-foreground uppercase tracking-wider">NSE Portfolio</span>
          </div>

          <p className="text-[0.6875rem] text-muted-foreground truncate">{displayName}'s portfolio</p>
          <p className="text-[1.625rem] font-bold tabular leading-tight mt-0.5">
            {hideAmounts ? "KES ••••••" : `KES ${kes(totalValue)}`}
          </p>

          {!hideGains && (
            <div className={`inline-flex items-center gap-1 mt-1.5 text-[0.8125rem] font-semibold ${primaryGain >= 0 ? "text-bull" : "text-bear"}`}>
              {primaryGain >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {hideAmounts ? "" : `${primaryGain >= 0 ? "+" : "−"}KES ${kes(Math.abs(primaryGain))} `}
              ({primaryGain >= 0 ? "+" : ""}{primaryPct.toFixed(2)}%) {showDayChange ? "today" : "all-time"}
            </div>
          )}
        </div>

        {shown.length > 0 && (
          <div className="px-5 pb-5 space-y-2.5">
            {shown.map((h) => (
              <div key={h.symbol} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-[0.5625rem] font-bold shrink-0" style={{ background: rgb(mutedRgb) }}>
                    {h.symbol.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.75rem] font-semibold truncate">{h.symbol}</p>
                    {!hideAmounts && <p className="text-[0.625rem] text-muted-foreground">{h.shares} sh</p>}
                  </div>
                </div>
                {!hideGains && (
                  <span className={`text-[0.75rem] font-semibold tabular ${(showDayChange ? h.dayChangePct : h.gainPct) >= 0 ? "text-bull" : "text-bear"}`}>
                    {(showDayChange ? h.dayChangePct : h.gainPct) >= 0 ? "+" : ""}
                    {(showDayChange ? h.dayChangePct : h.gainPct).toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${rgb(borderOnCardRgb)}`, background: rgb(footerBgRgb) }}>
          <p className="text-[0.59375rem] text-center text-muted-foreground">Track NSE stocks on Continua</p>
        </div>
      </div>
    );
  }
);
PortfolioShareCard.displayName = "PortfolioShareCard";
