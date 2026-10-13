import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Use a real calendar date');
const amount = z.number().finite().min(0).max(1e12);
export const StressSchema = z.object({ marketShock: z.number().finite().min(-.9).max(1), sectorShocks: z.record(z.string().min(1).max(80), z.number().finite().min(-.9).max(1)).default({}) }).strict().refine(v => Object.keys(v.sectorShocks).length <= 20, 'Maximum 20 sector shocks');
export const BondLabSchema = z.object({ settlement: date, previousCoupon: date, nextCoupon: date, couponPerPeriod: amount, yieldPercent: z.number().finite().min(0).max(100), frequency: z.union([z.literal(1), z.literal(2), z.literal(4)]), cashFlows: z.array(z.object({ date, amount: amount.min(.01) }).strict()).min(1).max(120), shockBps: z.number().finite().min(-1000).max(1000) }).strict().superRefine((b, ctx) => {
    const reject = (message) => ctx.addIssue({ code: 'custom', message });
    if (b.previousCoupon > b.settlement || b.nextCoupon <= b.settlement)
        reject('Settlement must lie inside the coupon period');
    if (Date.parse(b.nextCoupon) - Date.parse(b.previousCoupon) > 370 * 86400000 / b.frequency || Date.parse(b.nextCoupon) - Date.parse(b.previousCoupon) < 300 * 86400000 / b.frequency)
        reject('Coupon dates must describe one regular payment period; irregular coupons require separate review');
    if (b.couponPerPeriod > 0 && !b.cashFlows.some(f => f.date === b.nextCoupon && f.amount >= b.couponPerPeriod))
        reject('Include the next coupon payment in the future cash flows');
    if (b.cashFlows.some(f => f.date <= b.settlement))
        reject('Every future cash flow must be after settlement');
    if (new Set(b.cashFlows.map(f => f.date)).size !== b.cashFlows.length)
        reject('Combine payments on the same date');
    if (b.cashFlows.some(f => Date.parse(f.date) - Date.parse(b.settlement) > 60 * 365.25 * 86400000))
        reject('Maximum 60-year cash-flow horizon');
    if (b.yieldPercent + b.shockBps / 100 < 0)
        reject('Yield after shock cannot be negative in this calculator');
});
export const FuturesLabSchema = z.object({ entry: amount.positive(), settlement: amount.positive(), multiplier: amount.positive().max(1e6), contracts: z.number().int().min(1).max(100000), side: z.enum(['long', 'short']), margin: amount.positive(), expiry: date, asOf: date, shockPercent: z.number().finite().min(-90).max(100) }).strict();
