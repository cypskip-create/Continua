/**
 * Color-aware chart tooltip + legend key.
 *
 * Every value in the tooltip is rendered in the SAME colour as the series it
 * belongs to, so a blue bar reads as blue text in light, dark and AMOLED modes.
 * Labels use `text-foreground` / `text-muted-foreground` so they invert with the
 * theme automatically (black on light, white on dark).
 */

interface TooltipEntry {
  name?: string;
  value?: any;
  dataKey?: string;
  color?: string;
  payload?: any;
}

interface ColorTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: any;
  /** Format the numeric value, e.g. (v) => `KES ${v}B` */
  format?: (value: any, entry: TooltipEntry) => string;
  /** Override the colour resolution (needed for per-Cell coloured bars). */
  colorFor?: (entry: TooltipEntry) => string | undefined;
  /** Optional suffix line under the values. */
  footer?: string;
}

export function ColorTooltip({ active, payload, label, format, colorFor, footer }: ColorTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-popover/95 text-popover-foreground backdrop-blur-md px-2.5 py-2 shadow-xl ring-1 ring-border/60 min-w-[120px]">
      {label !== undefined && label !== null && (
        <p className="text-[0.625rem] font-semibold text-foreground mb-1.5">{String(label)}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const color =
            colorFor?.(entry) ||
            entry.color ||
            entry.payload?.fill ||
            "hsl(var(--foreground))";
          const value = format ? format(entry.value, entry) : entry.value;
          return (
            <div key={i} className="flex items-center gap-2 text-[0.6875rem] whitespace-nowrap">
              <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: color }} />
              {entry.name && <span className="text-muted-foreground">{entry.name}</span>}
              <span className="font-semibold tabular ml-auto" style={{ color }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
      {footer && <p className="text-[0.5625rem] text-muted-foreground mt-1.5">{footer}</p>}
    </div>
  );
}

/** Compact colour key rendered under a chart. */
export function ChartKey({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
