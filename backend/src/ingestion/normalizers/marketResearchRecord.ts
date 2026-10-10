import { z } from "zod";
const official = ["centralbank.go.ke", "knbs.or.ke", "nse.co.ke", "cma.or.ke"];
export const MarketResearchRecordSchema = z
  .object({
    id: z.string().min(1).max(180),
    kind: z.enum(["ipo", "macro", "economic", "bond", "derivative", "usp", "market_statistics"]),
    title: z.string().min(1).max(300),
    symbol: z.string().max(20).nullable().default(null),
    observedAt: z.string().datetime({ offset: true }),
    sourceUrl: z
      .string()
      .url()
      .refine((raw) => {
        const u = new URL(raw);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          official.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
        );
      }, "Only official CBK, KNBS, NSE or CMA HTTPS sources are accepted"),
    payload: z
      .object({
        status: z.enum(["Available", "To be Listed", "Listed"]).optional(),
        date: z.string().datetime({ offset: true }).optional(),
        price: z.number().positive().optional(),
        shares: z.number().positive().optional(),
        actual: z.number().finite().optional(),
        previous: z.number().finite().optional(),
        consensus: z.number().finite().optional(),
        unit: z.string().max(40).optional(),
        importance: z.number().int().min(1).max(3).optional(),
        tenor: z.number().positive().optional(),
        coupon: z.number().nonnegative().optional(),
        maturity: z.string().datetime({ offset: true }).optional(),
        yield: z.number().finite().optional(),
        yieldBasis: z.enum(["accepted_auction", "secondary_market"]).optional(),
        indicator: z.string().max(100).optional(),
        isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/).optional(),
        expiry: z.string().datetime({ offset: true }).optional(),
        volume: z.number().int().nonnegative().optional(),
        openInterest: z.number().int().nonnegative().optional(),
        turnover: z.number().nonnegative().optional(),
        change: z.number().finite().optional(),
        permissionReference: z.string().min(1).max(200).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const nseMarket = new URL(r.sourceUrl).hostname.endsWith("nse.co.ke") && ["bond", "derivative", "usp", "market_statistics"].includes(r.kind);
    if (nseMarket && !r.payload.permissionReference) ctx.addIssue({ code: "custom", message: "NSE market observations require a written commercial permission reference" });
    if (r.kind === "derivative" && (r.payload.price == null || !r.payload.expiry || !r.payload.isin)) ctx.addIssue({ code: "custom", message: "Derivatives need settlement price, ISIN and expiry" });
    if (r.kind === "usp" && r.payload.price == null) ctx.addIssue({ code: "custom", message: "USP observations need a reported price" });
    if (r.kind === "market_statistics" && (r.payload.actual == null || !r.payload.indicator || !r.payload.unit)) ctx.addIssue({ code: "custom", message: "Statistics need value, indicator and unit" });
    if (
      r.kind === "bond" &&
      (r.payload.tenor == null || r.payload.yield == null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Bond observations need tenor and auction yield",
      });
    if (
      r.kind === "macro" &&
      (r.payload.actual == null || !r.payload.indicator || !r.payload.unit)
    )
      ctx.addIssue({
        code: "custom",
        message: "Macro observations need actual, indicator and unit",
      });
    if (r.kind === "ipo" && !r.payload.status)
      ctx.addIssue({
        code: "custom",
        message: "IPO observations need a confirmed status",
      });
    if (r.kind === "economic" && !r.payload.date)
      ctx.addIssue({
        code: "custom",
        message: "Calendar events need an officially announced date",
      });
  });
