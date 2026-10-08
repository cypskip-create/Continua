import { useEffect, useId, useState } from "react";
import { applyFontScale, FONT_SCALE_EVENT, FONT_SCALE_KEY, getFontScale, MAX_FONT_PERCENT, MIN_FONT_PERCENT } from "@/lib/appearance";

export function FontSizeControl() {
  const id = useId();
  const [percent, setPercent] = useState(() => Math.round(Number(getFontScale()) * 100));
  useEffect(() => {
    const sync = () => setPercent(Math.round(Number(getFontScale()) * 100));
    const fromStorage = (event: StorageEvent) => {
      if (event.key === FONT_SCALE_KEY || event.key === null) applyFontScale(event.newValue ?? "1");
    };
    window.addEventListener(FONT_SCALE_EVENT, sync);
    window.addEventListener("storage", fromStorage);
    return () => {
      window.removeEventListener(FONT_SCALE_EVENT, sync);
      window.removeEventListener("storage", fromStorage);
    };
  }, []);
  const change = (next: number) => {
    setPercent(next);
    applyFontScale(String(next / 100));
  };
  const progress = ((percent - MIN_FONT_PERCENT) / (MAX_FONT_PERCENT - MIN_FONT_PERCENT)) * 100;
  return (
    <section className="font-size-control" aria-label="Font size settings">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-medium">Text size</label>
        <output htmlFor={id} className="tabular-nums text-muted-foreground">{percent}%</output>
      </div>
      <p className="mt-1 text-muted-foreground">Drag for live changes across the app.</p>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" style={{ fontSize: 12 }}>A</span>
        <input
          id={id}
          type="range"
          min={MIN_FONT_PERCENT}
          max={MAX_FONT_PERCENT}
          step={1}
          value={percent}
          aria-valuetext={`${percent}% of default text size`}
          onChange={event => change(Number(event.target.value))}
          className="font-size-range"
          style={{ backgroundImage: `linear-gradient(to right, hsl(var(--primary)) ${progress}%, hsl(var(--border)) ${progress}%)`, backgroundSize: "100% 6px", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
        />
        <span aria-hidden="true" style={{ fontSize: 22 }}>A</span>
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>Smaller · {MIN_FONT_PERCENT}%</span><span>Larger · {MAX_FONT_PERCENT}%</span>
      </div>
      <div className="mt-2 border-y border-border py-2" aria-label="Text size preview" style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
        <p className="font-semibold">Your market, at a glance</p>
        <p className="text-muted-foreground">Company evidence, portfolio insights and your research notes.</p>
      </div>
      <button type="button" onClick={() => change(100)} className="mt-1 text-primary font-semibold" style={{ minHeight: 44 }}>Reset text size</button>
    </section>
  );
}
