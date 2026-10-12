import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { engineAdvancedApi } from "@/api/engineAdvancedApi";
import { ResearchChart } from "@/components/markets/ResearchChart";
import { ExportResearch } from "./ResearchExport";
const kinds = [
  "total-return",
  "benchmark",
  "bootstrap",
  "replay",
  "cross-asset",
  "factor-risk",
] as const;
const templates: Record<(typeof kinds)[number], object> = {
  "factor-risk": {
    kind: "factor-risk",
    sourceUrl: "",
    basis: "price",
    factorSources: {},
    observations: [],
  },
  "total-return": {
    kind: "total-return",
    sourceUrl: "",
    points: [],
    actions: [],
    actionCoverageConfirmed: false,
  },
  benchmark: {
    kind: "benchmark",
    sourceUrl: "",
    benchmarkSourceUrl: "",
    basis: "price",
    points: [],
    benchmark: [],
  },
  bootstrap: {
    kind: "bootstrap",
    sourceUrl: "",
    points: [],
    paths: 500,
    horizon: 60,
    seed: 42,
    blockSize: 5,
  },
  replay: { kind: "replay", sourceUrl: "", points: [], start: "", end: "" },
  "cross-asset": { kind: "cross-asset", currency: "KES", positions: [] },
};
const help: Record<(typeof kinds)[number], string> = {
  "factor-risk":
    "Supply at least 180 observations: {date, portfolioReturn, factors: {factorName: decimalReturn}}, plus a source mapping for every factor. One to three aligned factors only. Engine fits early data and evaluates a later holdout; these diagnostics do not certify a production risk model.",
  "total-return":
    "Provide {date, close} observations and {date, splitRatio or dividend, sourceUrl} events. Confirm complete event coverage only after checking it. Unsupported rights issues require a verified mapping. No events are guessed.",
  benchmark:
    "Provide portfolio points and benchmark points on identical dates, with at least 60 returns. Both must have the same price/total-return basis. Portfolio values must already be cash-flow adjusted.",
  bootstrap:
    "Provide at least 120 continuous daily returns. This resamples the supplied history in blocks; it cannot estimate unseen crises. Seed makes results reproducible. It does not establish calibrated future probabilities.",
  replay:
    "Choose start/end dates that exist in your supplied observations. This replays past price changes, not account performance or a forecast.",
  "cross-asset":
    "Provide {name, assetClass, value, asOf, sourceUrl} on a single date in KES. Classes: equity, bond, cash, futures-collateral. Enter net asset values, never futures notional. This is a manual inventory, not a connected account.",
};
export function AdvancedResearchLab({ symbol }: { symbol: string }) {
  const [kind, setKind] = useState<(typeof kinds)[number]>("total-return"),
    [input, setInput] = useState(
      JSON.stringify(templates["total-return"], null, 2),
    );
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const load = useMutation({
    mutationFn: () => engineAdvancedApi.history(symbol, start, end),
    onSuccess: (data) => {
      setInput(
        JSON.stringify(
          {
            ...templates[kind],
            sourceUrl: data.sourceUrls[0],
            additionalSourceUrls: data.sourceUrls.slice(1),
            points: data.points,
            ...(kind === "replay"
              ? { start: data.points[0].date, end: data.points.at(-1)!.date }
              : {}),
          },
          null,
          2,
        ),
      );
      run.reset();
    },
  });
  const run = useMutation({
    mutationFn: () => {
      let body: unknown;
      try {
        body = JSON.parse(input);
      } catch {
        throw new Error("Enter valid JSON before calculating.");
      }
      return engineAdvancedApi.calculate(body);
    },
  });
  return (
    <section className="space-y-4 rounded-2xl border p-4">
      <h3 className="text-lg font-semibold">Advanced evidence lab</h3>
      <p className="text-sm text-muted-foreground">
        Bring dated, source-backed inputs. These tools do not fill gaps or
        publish uploaded figures into company data.
      </p>
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            type="button"
            key={k}
            disabled={run.isPending || load.isPending}
            className={`rounded-full px-3 py-2 text-xs ${kind === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            onClick={() => {
              setKind(k);
              setInput(JSON.stringify(templates[k], null, 2));
              run.reset();
              load.reset();
            }}
          >
            {k.replaceAll("-", " ")}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{help[kind]}</p>
      {kind !== "cross-asset" && kind !== "factor-risk" && (
        <form
          className="space-y-2 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            load.mutate();
          }}
        >
          <p className="text-sm font-semibold">
            Load stored {symbol} price evidence
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Start
              <input
                required
                type="date"
                className="w-full border rounded p-2"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="text-xs">
              End
              <input
                required
                type="date"
                className="w-full border rounded p-2"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <button
            disabled={load.isPending || run.isPending}
            className="text-sm text-primary"
          >
            Load observed sessions into inputs
          </button>
          <p className="text-xs text-muted-foreground">
            This replaces the current input draft. Corporate actions and
            benchmark history are not inferred.
          </p>
          {load.error && (
            <p role="alert" className="text-xs text-destructive">
              {load.error.message}
            </p>
          )}
          {load.data && (
            <p className="text-xs text-muted-foreground">
              {load.data.points.length} observations loaded · {load.data.basis}
            </p>
          )}
        </form>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
        className="space-y-3"
      >
        <label className="block text-sm">
          Research inputs (JSON)
          <textarea
            className="mt-2 w-full rounded-lg border bg-background p-3 font-mono text-xs"
            rows={12}
            maxLength={350000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Dates use YYYY-MM-DD. HTTPS links identify claimed sources; Engine
          does not independently verify edited manual inputs.
        </p>
        <button
          disabled={run.isPending || load.isPending}
          className="rounded-full bg-primary px-4 py-2 text-primary-foreground"
        >
          {run.isPending ? "Calculating…" : "Calculate from supplied evidence"}
        </button>
      </form>
      {run.error && (
        <p role="alert" className="text-sm text-destructive">
          {run.error.message}
        </p>
      )}
      {run.data && (
        <div className="space-y-3">
          <p className="text-xs">
            Last calculation; editing inputs does not change this result.
          </p>
          {run.data.curve && (
            <ResearchChart
              data={run.data.curve}
              lines={[
                {
                  key: "index",
                  label:
                    run.data.kind === "factor-risk"
                      ? "Observed return (%)"
                      : "Research index",
                  color: "#4b7bf5",
                },
                ...(["benchmark", "factor-risk"].includes(run.data.kind)
                  ? [
                      {
                        key: "benchmark",
                        label:
                          run.data.kind === "factor-risk"
                            ? "OLS fitted return (%)"
                            : "Benchmark",
                        color: "#f58220",
                      },
                    ]
                  : []),
              ]}
              band={run.data.kind === "bootstrap"}
            />
          )}
          <dl className="grid grid-cols-2 gap-3">
            {Object.entries(run.data)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">
                    {k.replace(/([A-Z])/g, " $1")}
                  </dt>
                  <dd className="font-semibold">
                    {Number(v).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </dd>
                </div>
              ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {run.data.methodology}
          </p>
          <p className="text-xs text-muted-foreground">
            {run.data.inputVerification}
          </p>
          <details>
            <summary>Full result and source details</summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(run.data, null, 2)}
            </pre>
          </details>
          <ExportResearch name={`advanced-${run.data.kind}`} data={run.data} />
        </div>
      )}
    </section>
  );
}
