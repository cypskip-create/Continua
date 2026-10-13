import { z } from "zod";
export const ForecastCreateSchema = z
    .object({
    symbol: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9.\-]{1,20}$/),
    question: z.string().trim().min(10).max(400),
    rules: z.string().trim().min(20).max(2000),
    deadline: z.string().datetime(),
    probability: z.number().finite().min(0).max(1),
    rationale: z.string().trim().min(5).max(2000),
})
    .strict()
    .refine((v) => Date.parse(v.deadline) > Date.now() &&
    Date.parse(v.deadline) < Date.now() + 10 * 366 * 86400000, "Deadline must be in the next ten years");
export const ForecastRevisionSchema = z
    .object({
    probability: z.number().finite().min(0).max(1),
    rationale: z.string().trim().min(5).max(2000),
})
    .strict();
export const ForecastResolutionSchema = z
    .object({
    outcome: z.enum(["yes", "no", "void"]),
    sourceUrl: z
        .string()
        .url()
        .refine((v) => v.startsWith("https://")),
    note: z.string().trim().min(10).max(2000),
})
    .strict();
export function canReviseForecast(row, now = new Date()) {
    return row.status === "open" && Date.parse(row.deadline) > now.getTime();
}
export function privateCalibration(rows) {
    const valid = rows.filter((r) => r.status === "resolved" &&
        typeof r.outcome === "boolean" &&
        r.resolved_at &&
        Date.parse(r.resolved_at) >= Date.parse(r.deadline) &&
        r.revisions.length > 0 &&
        r.revisions.every((v) => Number.isFinite(v.probability) &&
            v.probability >= 0 &&
            v.probability <= 1 &&
            Date.parse(v.at) < Date.parse(r.deadline)));
    const brier = (p, outcome) => (p - Number(outcome)) ** 2;
    const mean = (x) => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
    return {
        resolvedCount: valid.length,
        initialBrier: mean(valid.map((r) => brier(r.revisions[0].probability, r.outcome))),
        latestBrier: mean(valid.map((r) => brier(r.revisions.at(-1).probability, r.outcome))),
        bins: Array.from({ length: 5 }, (_, i) => {
            const entries = valid.filter((r) => Math.min(4, Math.floor(r.revisions.at(-1).probability * 5)) === i);
            return {
                range: `${i * 20}–${(i + 1) * 20}%`,
                count: entries.length,
                meanProbability: mean(entries.map((r) => r.revisions.at(-1).probability)),
                observedYesRate: mean(entries.map((r) => Number(r.outcome))),
            };
        }),
        methodology: "Private binary Brier error: (probability − outcome)²; lower is better. Initial and latest pre-deadline forecasts are scored separately, not time-weighted. Outcomes are user-reported with linked evidence, not independently verified. Voids excluded; small samples do not establish forecasting skill.",
        warning: valid.length < 20
            ? "Fewer than 20 resolved questions: calibration is descriptive and highly uncertain."
            : null,
    };
}
