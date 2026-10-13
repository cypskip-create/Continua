import { financialsRepository } from '../../storage/repositories/financialsRepository.js';
import { pricesRepository } from '../../storage/repositories/pricesRepository.js';
import { candlesRepository } from '../../storage/repositories/candlesRepository.js';
import { annualRatioAt } from './valuationHistory.js';
export async function valuationHistory(exchange, symbol, ratio, years) {
    const id = `${exchange}:${symbol}`, now = new Date(), from = new Date(now.getTime() - years * 365.25 * 86400000).toISOString();
    const [periods, quote, candles] = await Promise.all([financialsRepository.getHistoricalPeriods(id, 'annual', 50), pricesRepository.getQuote(id), candlesRepository.getCandles(id, '1d', from, now.toISOString())]);
    const daily = new Map();
    for (const c of candles)
        if (c.close > 0 && Number.isFinite(c.close))
            daily.set(c.timestamp.slice(0, 10), c);
    const points = [...daily.values()].map(c => ({ date: c.timestamp.slice(0, 10), time: Date.parse(c.timestamp), ...annualRatioAt(periods, c.close, c.timestamp, ratio) }));
    const current = quote ? { date: quote.timestamp.slice(0, 10), time: Date.parse(quote.timestamp), ...annualRatioAt(periods, quote.lastPrice, quote.timestamp, ratio) } : null;
    return { symbol, ratio, current, points, lastHistoricalDate: points.at(-1)?.date ?? null,
        basis: 'Annual reported financials available on each observation date; not TTM or forward. Historical closes and the latest quote are distinct dated observations.' };
}
