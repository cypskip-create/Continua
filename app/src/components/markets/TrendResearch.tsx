import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { historicalApi } from "@/api/historicalApi";
import { CANONICAL_SYMBOLS } from "@/lib/stockPrices";
import { alignedReturns, correlation, trendScenario } from "@/lib/marketMath";
import { ResearchChart, type ChartPoint } from "./ResearchChart";

/** Dated, aligned closes: ordinal sparkline points cannot be used for correlation. */
export function TrendResearch({
  compact = false,
  symbols,
}: {
  compact?: boolean;
  symbols?: string[];
}) {
  const [first, setFirst] = useState("KCB"),
    [second, setSecond] = useState("EQTY"),
    [period, setPeriod] = useState("3M");
  const requested = symbols?.length ? symbols : [first, second];
  const key = [...new Set(requested)].sort();
  const history = useQuery({
    queryKey: ["continua", "market-trends", key, period],
    queryFn: async () => {
      const from = new Date();
      from.setDate(
        from.getDate() - (period === "1M" ? 31 : period === "1Y" ? 366 : 92),
      );
      return Promise.all(
        key.map(async (symbol) => ({
          symbol,
          candles: await historicalApi.getCandles(symbol, {
            from: from.toISOString(),
            interval: "1d",
          }),
        })),
      );
    },
    staleTime: 300_000,
    retry: 1,
  });
  const aligned = alignedReturns(history.data ?? []);
  const data: ChartPoint[] = [...aligned];
  const primary = requested[0],
    values = aligned.map((r) => Number(r[primary]));
  const returns = (symbol: string) =>
    aligned
      .slice(1)
      .map((r, i) => Math.log(Number(r[symbol]) / Number(aligned[i][symbol])));
  const similarity =
    requested.length === 2
      ? correlation(returns(requested[0]), returns(requested[1]))
      : null;
  // A deliberately labelled drift scenario, not Moomoo's proprietary prediction.
  if (!symbols && aligned.length >= 20) {
    data[data.length - 1] = {
      ...data[data.length - 1],
      scenario: values.at(-1),
      band: [values.at(-1)!, values.at(-1)!],
    };
    let future = new Date(aligned.at(-1)!.date + "T12:00:00Z");
    for (const s of trendScenario(values)) {
      do {
        future = new Date(future.getTime() + 86400000);
      } while ([0, 6].includes(future.getUTCDay()));
      data.push({
        date: future.toISOString().slice(0, 10),
        scenario: s.center,
        band: [s.lower, s.upper],
      });
    }
  }
  const colors = ["hsl(var(--primary))", "#ea8b24", "#0d9488", "#e45d8a"];
  return (
    <div>
      {symbols && (
        <div
          className="market-choices"
          role="group"
          aria-label="Comparison period"
        >
          {["1M", "3M", "1Y"].map((p) => (
            <button
              key={p}
              className={`pill-tab ${period === p ? "contrast-active" : ""}`}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {!symbols && (
        <div className="flex flex-wrap items-center gap-3 my-4">
          {[
            [first, setFirst, "Primary stock"],
            [second, setSecond, "Comparison stock"],
          ].map(([value, set, label]) => (
            <label className="text-xs" key={label as string}>
              {label as string}
              <select
                aria-label={label as string}
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
                className="block bg-background border rounded-full py-2 px-3 mt-1"
              >
                {CANONICAL_SYMBOLS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          ))}
          {!compact && (
            <label className="text-xs">
              History period
              <select
                aria-label="History period"
                className="block bg-background border rounded-full py-2 px-3 mt-1"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {["1M", "3M", "1Y"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {history.isLoading ? (
        <p className="market-empty">Loading verified closes…</p>
      ) : history.isError ? (
        <p className="market-empty">
          Historical prices could not load.{" "}
          <button
            className="underline text-primary"
            onClick={() => void history.refetch()}
          >
            Retry history
          </button>
        </p>
      ) : (
        <ResearchChart
          data={data}
          band={!symbols}
          lines={[
            ...requested.map((symbol, i) => ({
              key: symbol,
              label: symbol,
              color: colors[i],
            })),
            ...(!symbols
              ? [
                  {
                    key: "scenario",
                    label: "Illustrative drift",
                    color: colors[0],
                    dashed: true,
                  },
                ]
              : []),
          ]}
        />
      )}
      {similarity != null && (
        <p className="text-sm mt-4">
          Return correlation <strong>{similarity.toFixed(2)}</strong> ·{" "}
          {aligned.length} aligned closes
        </p>
      )}
      <p className="market-note">
        Common trading dates only; first common close = 100. Price returns
        exclude dividends and do not adjust for corporate actions.
        {!symbols
          ? " Dashed line: mean historical log-return drift over five weekdays; shaded range: ± one historical volatility scale. Not a confidence interval, guaranteed forecast or investment recommendation."
          : ""}
      </p>
    </div>
  );
}
