import { z } from 'zod';
export const EarningsSensitivitySchema = z.object({ symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,20}$/), years: z.number().int().min(1).max(10), growthPercent: z.number().finite().min(-80).max(100), exitPe: z.number().finite().min(1).max(100) }).strict();
export function earningsSensitivity(eps, price, years, growthPercent, exitPe) {
    if (![eps, price, years, growthPercent, exitPe].every(Number.isFinite) || eps <= 0 || price <= 0 || !Number.isInteger(years) || years < 1 || years > 10 || growthPercent < -80 || growthPercent > 100 || exitPe < 1 || exitPe > 100)
        throw new Error('Positive dated EPS and price, a 1–10 year horizon and bounded assumptions are required.');
    const growthRates = [growthPercent - 10, growthPercent, growthPercent + 10].filter(g => g >= -90 && g <= 110);
    const multiples = [exitPe * .75, exitPe, exitPe * 1.25];
    const cells = growthRates.flatMap(g => multiples.map(pe => { const projectedEps = eps * (1 + g / 100) ** years, illustrativePrice = projectedEps * pe; return { growthPercent: g, exitPe: pe, projectedEps, illustrativePrice, changePercent: (illustrativePrice / price - 1) * 100, annualizedPriceReturnPercent: ((illustrativePrice / price) ** (1 / years) - 1) * 100 }; }));
    return { cells, breakEvenGrowthPercent: ((price / (eps * exitPe)) ** (1 / years) - 1) * 100,
        assumptions: { eps, currentPrice: price, years, growthPercent, exitPe },
        methodology: 'Hypothetical EPS × exit P/E sensitivity, not a forecast, fair-value estimate or analyst target. EPS compounds at each entered growth rate with unchanged share basis. Dividends, dilution, fees and taxes are excluded. No probabilities are assigned. Break-even growth only recovers the entered price before those exclusions.' };
}
