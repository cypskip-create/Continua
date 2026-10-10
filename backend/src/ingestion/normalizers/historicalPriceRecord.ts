import { z } from "zod";
/** Source permission is an operator assertion retained with every imported observation.
 * Closing prices alone are NOT valid OHLC bars. */
export const HistoricalPriceRecordSchema = z.object({
  symbol: z.string().regex(/^[A-Z][A-Z0-9]{0,19}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value && value >= "2015-01-01" && d.getTime() <= Date.now();
  }, "A real observation date from 2015 onward is required"),
  currency: z.literal("KES"),
  open: z.number().positive(), high: z.number().positive(), low: z.number().positive(), close: z.number().positive(),
  volume: z.number().int().nonnegative(),
  sourceUrl: z.string().url().refine(value => { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; }),
  permissionReference: z.string().min(1).max(200),
  adjustment: z.literal("unadjusted"),
}).strict().superRefine((r, ctx) => {
  if (r.high < Math.max(r.open,r.close,r.low) || r.low > Math.min(r.open,r.close)) ctx.addIssue({ code: "custom", message: "OHLC range is inconsistent" });
});
