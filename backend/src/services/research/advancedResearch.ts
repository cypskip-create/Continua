import { z } from "zod";
import { totalReturnSeries } from "./engineRiskLab.js";
import { factorResearch } from "./factorResearch.js";

export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Real calendar date required",
  );
const source = z
  .string()
  .max(2048)
  .url()
  .refine((v) => v.startsWith("https://"), "HTTPS source required");
const series = z
  .array(
    z
      .object({
        date: CalendarDate,
        close: z.number().finite().min(1e-8).max(1e15),
      })
      .strict(),
  )
  .min(2)
  .max(1500);
const base = {
  points: series,
  sourceUrl: source,
  additionalSourceUrls: z.array(source).max(1500).optional(),
};
export const AdvancedResearchSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("factor-risk"),
      sourceUrl: source,
      basis: z.enum(["price", "total-return"]),
      factorSources: z
        .record(source)
        .refine(
          (v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 3,
        ),
      observations: z
        .array(
          z
            .object({
              date: CalendarDate,
              portfolioReturn: z.number().finite().min(-0.95).max(5),
              factors: z
                .record(z.number().finite().min(-0.95).max(5))
                .refine(
                  (v) =>
                    Object.keys(v).length >= 1 && Object.keys(v).length <= 3,
                ),
            })
            .strict(),
        )
        .min(180)
        .max(1500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("total-return"),
      ...base,
      actions: z
        .array(
          z
            .object({
              date: CalendarDate,
              splitRatio: z.number().finite().positive().max(1000).optional(),
              dividend: z.number().finite().nonnegative().max(1e12).optional(),
              sourceUrl: source,
            })
            .strict(),
        )
        .max(300),
      actionCoverageConfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("benchmark"),
      ...base,
      benchmark: series,
      benchmarkSourceUrl: source,
      basis: z.enum(["price", "total-return"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("bootstrap"),
      ...base,
      paths: z.number().int().min(100).max(1000),
      horizon: z.number().int().min(1).max(252),
      seed: z.number().int().min(1).max(2147483646),
      blockSize: z.number().int().min(1).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("replay"),
      ...base,
      start: CalendarDate,
      end: CalendarDate,
    })
    .strict(),
  z
    .object({
      kind: z.literal("cross-asset"),
      currency: z.literal("KES"),
      positions: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(80),
              assetClass: z.enum([
                "equity",
                "bond",
                "cash",
                "futures-collateral",
              ]),
              value: z.number().finite().nonnegative().max(1e15),
              asOf: CalendarDate,
              sourceUrl: source,
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
]);
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
const variance = (x: number[]) => {
  const m = mean(x);
  return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
};
const percentile = (x: number[], p: number) => {
  const a = [...x].sort((x, y) => x - y);
  return a[Math.floor((a.length - 1) * p)]!;
};
function checked(points: { date: string; close: number }[], today: string) {
  const p = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (
    new Set(p.map((x) => x.date)).size !== p.length ||
    p.some((x) => x.date > today)
  )
    throw new Error("Duplicate or future observations cannot be used.");
  return p;
}
function dailyReturns(p: { date: string; close: number }[]) {
  if (
    p.some(
      (x, i) =>
        i > 0 && Date.parse(x.date) - Date.parse(p[i - 1]!.date) > 4 * 86400000,
    )
  )
    throw new Error(
      "History gaps exceed four calendar days. Supply continuous observed sessions; missing sessions are never interpolated.",
    );
  return p.slice(1).map((x, i) => x.close / p[i]!.close - 1);
}
export function advancedResearch(
  input: z.infer<typeof AdvancedResearchSchema>,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const common = {
    generatedAt: now.toISOString(),
    kind: input.kind,
    inputVerification:
      "User-supplied research inputs; a source URL is not independent verification. No uploaded data is published into company financials.",
    methodVersion: "advanced-research-v1",
  };
  if (input.kind === "factor-risk") {
    const rows = [...input.observations].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    checked(
      rows.map((r) => ({ date: r.date, close: 1 })),
      today,
    );
    dailyReturns(rows.map((r) => ({ date: r.date, close: 1 })));
    const names = Object.keys(rows[0]!.factors).sort();
    if (
      names.some((n) => !Object.hasOwn(input.factorSources, n)) ||
      Object.keys(input.factorSources).length !== names.length
    )
      throw new Error("Every factor requires exactly one source mapping.");
    return {
      ...common,
      ...factorResearch(rows),
      sources: [input.sourceUrl, ...Object.values(input.factorSources)],
      basis: input.basis,
    };
  }
  if (input.kind === "cross-asset") {
    if (input.positions.some((x) => x.asOf > today))
      throw new Error("Future valuations are unavailable.");
    if (new Set(input.positions.map((x) => x.asOf)).size !== 1)
      throw new Error(
        "Use one common valuation date before aggregating asset classes.",
      );
    const total = input.positions.reduce((s, x) => s + x.value, 0);
    if (total <= 0) throw new Error("Positive covered value required.");
    return {
      ...common,
      totalValue: total,
      currency: "KES",
      asOf: input.positions[0]!.asOf,
      positions: input.positions.map((x) => ({
        ...x,
        weightPercent: (x.value / total) * 100,
      })),
      methodology:
        "Manual covered net-asset-value inventory, not synchronized account holdings. Futures collateral is included only once; futures notional is not an asset value. No FX conversion or cross-asset risk aggregation.",
    };
  }
  const p = checked(input.points, today),
    sources = [
      ...new Set([input.sourceUrl, ...(input.additionalSourceUrls ?? [])]),
    ];
  if (input.kind === "total-return") {
    if (
      input.actions.some((a) => a.date < p[0]!.date || a.date > p.at(-1)!.date)
    )
      throw new Error("Actions must be inside the supplied history window.");
    dailyReturns(p);
    const curve = totalReturnSeries(p, input.actions);
    if (curve.some((p) => !Number.isFinite(p.index)))
      throw new Error("Adjustment overflow; action mappings require review.");
    return {
      ...common,
      curve,
      sources: [...sources, ...input.actions.map((x) => x.sourceUrl)],
      totalReturnPercent: curve.at(-1)!.index - 100,
      methodology:
        "Gross split/dividend total-return index rebased to 100; distributions reinvested at the ex-date close. User confirms complete event coverage. Rights issues, taxes, costs and withholding are unsupported; use a separately verified adjustment mapping for them.",
    };
  }
  if (input.kind === "replay") {
    if (input.start >= input.end || input.end > today)
      throw new Error("Select a past ordered start/end window.");
    const selected = p.filter(
      (x) => x.date >= input.start && x.date <= input.end,
    );
    if (
      selected.length < 2 ||
      selected[0]!.date !== input.start ||
      selected.at(-1)!.date !== input.end
    )
      throw new Error("Both selected endpoints must be observed sessions.");
    dailyReturns(selected);
    let peak = selected[0]!.close,
      worst = 0;
    selected.forEach((x) => {
      peak = Math.max(peak, x.close);
      worst = Math.min(worst, x.close / peak - 1);
    });
    return {
      ...common,
      curve: selected.map((x) => ({
        date: x.date,
        index: (100 * x.close) / selected[0]!.close,
      })),
      sources,
      start: input.start,
      end: input.end,
      returnPercent: 100 * (selected.at(-1)!.close / selected[0]!.close - 1),
      maxDrawdownPercent: worst * 100,
      methodology:
        "Replay of supplied observed price closes, not a named event reconstruction, actual account return or future forecast. Dividends and costs excluded.",
    };
  }
  if (input.kind === "benchmark") {
    const b = checked(input.benchmark, today);
    // No common-endpoint selection across missing intermediate sessions.
    if (p.length !== b.length || p.some((x, i) => x.date !== b[i]!.date))
      throw new Error(
        "Portfolio and benchmark must have identical observed dates.",
      );
    const r = dailyReturns(p),
      br = dailyReturns(b);
    if (r.length < 60) throw new Error("At least 60 aligned returns required.");
    const active = r.map((x, i) => x - br[i]!),
      tracking = Math.sqrt(variance(active)) * Math.sqrt(252),
      m = mean(active);
    const cov =
        r.reduce((s, x, i) => s + (x - mean(r)) * (br[i]! - mean(br)), 0) /
        (r.length - 1),
      bv = variance(br);
    return {
      ...common,
      sources: [...sources, input.benchmarkSourceUrl],
      basis: input.basis,
      observations: r.length,
      activeReturnPercent:
        100 * (p.at(-1)!.close / p[0]!.close - b.at(-1)!.close / b[0]!.close),
      trackingErrorPercent: tracking * 100,
      informationRatio: tracking > 1e-12 ? (m * 252) / tracking : null,
      beta: bv > 1e-18 ? cov / bv : null,
      curve: p.map((x, i) => ({
        date: x.date,
        index: (x.close / p[0]!.close) * 100,
        benchmark: (b[i]!.close / b[0]!.close) * 100,
      })),
      methodology:
        "Arithmetic daily active returns; tracking error and information ratio annualized at 252 sessions. User declares matching price/total-return basis. Portfolio series must already be flow-adjusted; this tool does not infer cash flows, attribution or fees.",
    };
  }
  const returns = dailyReturns(p);
  if (returns.length < 120 || returns.length < input.blockSize * 6)
    throw new Error(
      "At least 120 continuous daily returns and six complete sampling blocks required.",
    );
  let seed = input.seed;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const outcomes: number[] = [],
    paths: number[][] = [];
  for (let n = 0; n < input.paths; n++) {
    const path = [100];
    while (path.length <= input.horizon) {
      const start = Math.floor(
        random() * (returns.length - input.blockSize + 1),
      );
      for (
        let j = 0;
        j < input.blockSize && path.length <= input.horizon;
        j++
      ) {
        const next = path.at(-1)! * (1 + returns[start + j]!);
        if (!Number.isFinite(next))
          throw new Error("Simulation overflow; inputs require review.");
        path.push(next);
      }
    }
    paths.push(path);
    outcomes.push(path.at(-1)! - 100);
  }
  return {
    ...common,
    sources,
    observations: returns.length,
    seed: input.seed,
    blockSize: input.blockSize,
    horizon: input.horizon,
    paths: input.paths,
    p05ReturnPercent: percentile(outcomes, 0.05),
    medianReturnPercent: percentile(outcomes, 0.5),
    p95ReturnPercent: percentile(outcomes, 0.95),
    curve: Array.from({ length: input.horizon + 1 }, (_, i) => ({
      date: `Session ${i}`,
      index: percentile(
        paths.map((p) => p[i]!),
        0.5,
      ),
      band: [
        percentile(
          paths.map((p) => p[i]!),
          0.05,
        ),
        percentile(
          paths.map((p) => p[i]!),
          0.95,
        ),
      ],
    })),
    methodology:
      "Seeded moving-block bootstrap resamples observed daily price returns with replacement. Bands describe this chosen empirical model, not calibrated real-world probabilities or maximum losses. Assumes sampled history is representative; unobserved crises, corporate actions and costs are excluded.",
  };
}
