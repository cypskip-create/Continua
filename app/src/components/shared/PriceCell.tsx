import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PriceCellProps {
  /** Real last price, or null/undefined while loading — never a fabricated fallback. */
  price?: number | null;
  /** Real % change, or null/undefined while loading. */
  changePercent?: number | null;
  /** Explicit loading flag; defaults to `price == null`. */
  isLive?: boolean;
  size?: "sm" | "md";
  showIcon?: boolean;
  align?: "left" | "right";
  className?: string;
}

/**
 * The single place price + change% get rendered as a two-line stack
 * (price on top, colored % change with arrow below). Renders a loading
 * skeleton instead of a fabricated number whenever live data isn't in yet
 * — every list/detail surface should use this instead of hand-rolling the
 * same ternary, so a "no fabricated data" gap can't sneak back in file by
 * file. See useLiveQuotes for what feeds this.
 */
export function PriceCell({
  price, changePercent, isLive, size = "sm", showIcon = true, align = "right", className,
}: PriceCellProps) {
  const live = isLive ?? (price != null && changePercent != null);
  const isUp = (changePercent ?? 0) >= 0;
  const priceCls = size === "md" ? "text-sm font-bold" : "text-[13.5px] font-bold";
  const changeCls = size === "md" ? "text-xs font-semibold" : "text-[11px] font-semibold";

  if (!live) {
    return (
      <div className={cn("flex flex-col gap-1", align === "right" ? "items-end" : "items-start", className)}>
        <Skeleton className={size === "md" ? "h-4 w-16" : "h-3.5 w-14"} />
        <Skeleton className={size === "md" ? "h-3 w-10" : "h-3 w-9"} />
      </div>
    );
  }

  return (
    <div className={cn(align === "right" ? "text-right" : "text-left", className)}>
      <p className={cn(priceCls, "tabular-nums leading-tight")}>KES {price!.toFixed(2)}</p>
      <div className={cn("flex items-center gap-0.5 mt-0.5", align === "right" && "justify-end", isUp ? "text-bull" : "text-bear")}>
        {showIcon && (isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
        <span className={cn(changeCls, "tabular-nums")}>{isUp ? "+" : ""}{changePercent!.toFixed(2)}%</span>
      </div>
    </div>
  );
}