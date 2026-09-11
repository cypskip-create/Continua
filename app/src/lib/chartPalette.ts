/**
 * Institutional-grade semantic chart palette for Continua.
 * One color per concept — users understand every chart from color alone.
 * Values chosen to render cleanly on both light & dark canvases.
 */
export const fx = {
  // Income statement
  revenue: "#3b82f6",         // blue
  netIncome: "#10b981",       // emerald green
  earnings: "#22c55e",        // green
  operatingIncome: "#14b8a6", // teal
  ebitda: "#0ea5e9",          // sky

  // Balance sheet
  cash: "#059669",            // deep emerald
  debt: "#ef4444",            // red
  assets: "#8b5cf6",          // purple
  liabilities: "#f97316",     // orange
  equity: "#6366f1",          // indigo

  // Margins
  grossMargin: "#6366f1",     // indigo
  operatingMargin: "#14b8a6", // teal
  netMargin: "#22c55e",       // green

  // Ownership
  institutional: "#1e3a8a",   // dark blue
  retail: "#60a5fa",          // light blue
  foreign: "#eab308",         // gold
  government: "#6b7280",      // gray
  insider: "#a855f7",         // violet
  public: "#94a3b8",          // slate

  // Analysts
  buy: "#16a34a",
  hold: "#f59e0b",
  sell: "#dc2626",

  // Forecast / benchmarks
  forecast: "#94a3b8",        // muted slate
  sector: "#cbd5e1",          // very light slate
  benchmark: "#64748b",       // slate

  // Cash flow / other
  fcf: "#0ea5e9",             // sky
  eps: "#a855f7",             // violet
  positive: "#10b981",
  negative: "#ef4444",
  target: "#f59e0b",          // amber

  // Score gauges
  strong: "#10b981",
  ok: "#eab308",
  weak: "#ef4444",
} as const;

export const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.18)",
  color: "hsl(var(--card-foreground))",
} as const;

// Explicit label/item text colors for recharts <Tooltip>. Without these,
// the label ("Current", a date, etc.) and value text can end up relying on
// ambient/inherited color and go invisible against a dark tooltip
// background in dark mode. These always resolve to whatever the theme's
// current popover/card foreground is, so the text is guaranteed to
// contrast with `tooltipStyle`'s background in any mode.
export const tooltipLabelStyle = { color: "hsl(var(--popover-foreground))" } as const;
export const tooltipItemStyle = { color: "hsl(var(--popover-foreground))" } as const;

export const axisStyle = {
  tick: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
  axisLine: false as const,
  tickLine: false as const,
};

export const gridStyle = {
  stroke: "hsl(var(--border))",
  strokeDasharray: "2 4",
  vertical: false,
};