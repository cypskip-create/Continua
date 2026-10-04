import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Circle, DollarSign } from "lucide-react";
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay, isToday,
} from "date-fns";
import { InfoTip } from "./InfoTip";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; shares: number }

interface CalendarEvent {
  date: Date;
  symbol: string;
  kind: "ex-dividend" | "payment";
  estimated: boolean;
  amount: number | null; // per-share × shares, only known for real payment events
}

interface DividendCalendarProps {
  holdings: HoldingLike[];
  dividendData: Record<string, HoldingDividendData>;
  showValues?: boolean;
  currencyLabel?: string;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function DividendCalendar({ holdings, dividendData, showValues = true, currencyLabel = "KSh" }: DividendCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];
    holdings.forEach((h) => {
      const d = dividendData[h.symbol.toUpperCase()];
      if (!d) return;
      const push = (payouts: typeof d.payouts, estimated: boolean) => {
        payouts.forEach((p) => {
          if (p.exDate) list.push({ date: new Date(p.exDate), symbol: h.symbol, kind: "ex-dividend", estimated, amount: null });
          if (p.payDate) list.push({ date: new Date(p.payDate), symbol: h.symbol, kind: "payment", estimated, amount: estimated ? null : p.amountPerShare * h.shares });
        });
      };
      // Only the most recent real payout plus anything on the horizon is
      // relevant to a calendar view — no need to plot years of history.
      push(d.payouts.slice(0, 2), false);
      push(d.projected, true);
    });
    return list;
  }, [holdings, dividendData]);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsOn = (day: Date) => events.filter((e) => isSameDay(e.date, day));

  const upcoming = events
    .filter((e) => e.date.getTime() >= Date.now() - 86_400_000)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 8);

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-serif text-lg flex items-center gap-1.5">
          Calendar
          <InfoTip>
            Filled markers are confirmed ex-dividend and payment dates on file. Hollow markers
            are Continua's own projection, based on each holding's historical cadence — not an
            announcement from the company.
          </InfoTip>
        </h3>
        <div className="flex items-center gap-2">
          <button data-small-target onClick={() => setMonth((m) => subMonths(m, 1))} className="p-1 rounded-full hover:bg-muted active:opacity-70">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[0.75rem] font-semibold tabular w-20 text-center">{format(month, "MMM yyyy")}</span>
          <button data-small-target onClick={() => setMonth((m) => addMonths(m, 1))} className="p-1 rounded-full hover:bg-muted active:opacity-70">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground mb-3">Ex-dividend and payment dates for your holdings.</p>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[0.5625rem] font-semibold text-muted-foreground tracking-wide">{w}</span>
        ))}
        {days.map((day) => {
          const dayEvents = eventsOn(day);
          const inMonth = isSameMonth(day, month);
          return (
            <div
              key={day.toISOString()}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 ${
                isToday(day) ? "bg-primary/15" : inMonth ? "" : "opacity-30"
              }`}
            >
              <span className="text-[0.6875rem] tabular">{format(day, "d")}</span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full ${
                        e.kind === "ex-dividend"
                          ? e.estimated ? "border border-amber-500" : "bg-amber-500"
                          : e.estimated ? "border border-bull" : "bg-bull"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-border/50">
        <Legend swatch={<span className="w-2 h-2 rounded-full bg-amber-500" />} label="Ex-Dividend" />
        <Legend swatch={<span className="w-2 h-2 rounded-full border border-amber-500" />} label="Ex-Dividend (Est.)" />
        <Legend swatch={<DollarSign className="h-2.5 w-2.5 text-bull" />} label="Payment" />
        <Legend swatch={<Circle className="h-2 w-2 text-bull" />} label="Payment (Est.)" />
      </div>

      <p className="section-eyebrow mt-4 mb-2">Upcoming Events</p>
      {upcoming.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground py-2">No upcoming dividend events on file yet.</p>
      ) : (
        <div className="divide-y divide-border/40">
          {upcoming.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-[0.75rem]">
              <span className="tabular text-muted-foreground w-16 shrink-0">{format(e.date, "MMM dd")}</span>
              <span className="font-bold w-14 shrink-0">{e.symbol}</span>
              <span className="text-muted-foreground flex-1">
                {e.kind === "ex-dividend" ? "Ex-Dividend" : "Payment"}{e.estimated ? " (Est.)" : ""}
              </span>
              <span className="font-semibold tabular">
                {e.amount != null ? (showValues ? `${currencyLabel}${e.amount.toFixed(2)}` : "••••") : "n/a"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center w-3">{swatch}</span>
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
    </div>
  );
}
