import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { type IndicatorSettings } from "@/lib/technicalIndicators";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: IndicatorSettings;
  onChange: (next: IndicatorSettings) => void;
}

const OVERLAY_ROWS: { key: keyof IndicatorSettings["overlays"]; label: string; detail: string; swatch: string }[] = [
  { key: "ma", label: "MA", detail: "Moving averages · 5 / 20 / 50", swatch: "#3b82f6" },
  { key: "ema", label: "EMA", detail: "Exponential moving averages · 12 / 26", swatch: "#14b8a6" },
  { key: "boll", label: "BOLL", detail: "Bollinger Bands · 20, 2σ", swatch: "#94a3b8" },
  { key: "sar", label: "SAR", detail: "Parabolic SAR · stop & reverse", swatch: "#f59e0b" },
];

const SUB_PANEL_ROWS: { key: Exclude<IndicatorSettings["subPanel"], "none">; label: string; detail: string; swatch: string }[] = [
  { key: "macd", label: "MACD", detail: "12, 26, 9", swatch: "#3b82f6" },
  { key: "rsi", label: "RSI", detail: "14-period", swatch: "#a855f7" },
  { key: "kdj", label: "KDJ", detail: "Stochastic · 9, 3, 3", swatch: "#f59e0b" },
  { key: "wr", label: "WR", detail: "Williams %R · 14-period", swatch: "#ec4899" },
  { key: "cci", label: "CCI", detail: "Commodity Channel Index · 20-period", swatch: "#0ea5e9" },
];

export function ChartIndicatorsSheet({ open, onOpenChange, settings, onChange }: Props) {
  const toggleOverlay = (key: keyof IndicatorSettings["overlays"]) =>
    onChange({ ...settings, overlays: { ...settings.overlays, [key]: !settings.overlays[key] } });

  const setSubPanel = (key: IndicatorSettings["subPanel"]) =>
    onChange({ ...settings, subPanel: settings.subPanel === key ? "none" : key });

  const toggleVolume = () => onChange({ ...settings, volume: !settings.volume });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[75vh] overflow-y-auto z-[120]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-sm">Indicators</SheetTitle>
        </SheetHeader>

        <div className="mt-2">
          <p className="section-eyebrow mb-1">Overlays</p>
          <p className="text-[0.625rem] text-muted-foreground mb-2">Drawn directly on the price chart</p>
          <div className="divide-y divide-border/40">
            {OVERLAY_ROWS.map(row => (
              <div key={row.key} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.swatch }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{row.label}</p>
                    <p className="text-[0.625rem] text-muted-foreground truncate">{row.detail}</p>
                  </div>
                </div>
                <Switch checked={settings.overlays[row.key]} onCheckedChange={() => toggleOverlay(row.key)} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="section-eyebrow mb-1">Volume</p>
          <p className="text-[0.625rem] text-muted-foreground mb-2">A Moomoo-style bar panel below the price chart — can be shown together with an oscillator</p>
          <div className="flex items-center justify-between py-3 border-y border-border/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: "hsl(var(--bull))" }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold">VOL</p>
                <p className="text-[0.625rem] text-muted-foreground truncate">Shares traded per bar</p>
              </div>
            </div>
            <Switch checked={settings.volume} onCheckedChange={toggleVolume} />
          </div>
        </div>

        <div className="mt-4">
          <p className="section-eyebrow mb-1">Sub-chart</p>
          <p className="text-[0.625rem] text-muted-foreground mb-2">One oscillator panel below the chart at a time</p>
          <div className="divide-y divide-border/40">
            {SUB_PANEL_ROWS.map(row => (
              <div key={row.key} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: row.swatch }} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{row.label}</p>
                    <p className="text-[0.625rem] text-muted-foreground truncate">{row.detail}</p>
                  </div>
                </div>
                <Switch checked={settings.subPanel === row.key} onCheckedChange={() => setSubPanel(row.key)} />
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
