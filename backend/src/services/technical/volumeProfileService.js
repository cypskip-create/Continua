/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
const CAVEAT = "Approximated from daily OHLCV: each day's volume is spread evenly across " +
    "that day's high-low range, not from true intraday trade prints. Directionally " +
    "useful over weeks/months; not a substitute for an intraday profile on a single day.";
export const volumeProfileService = {
    async compute(exchange, symbol, from, to, bucketCount = 24) {
        const securityId = `${exchange}:${symbol}`;
        const candles = await candlesRepository.getCandles(securityId, "1d", from, to);
        if (candles.length === 0)
            return null;
        const overallLow = Math.min(...candles.map((c) => c.low));
        const overallHigh = Math.max(...candles.map((c) => c.high));
        if (overallHigh <= overallLow)
            return null; // degenerate range (e.g. single flat candle)
        const bucketSize = (overallHigh - overallLow) / bucketCount;
        const buckets = Array.from({ length: bucketCount }, (_, i) => ({
            priceLow: round(overallLow + i * bucketSize),
            priceHigh: round(overallLow + (i + 1) * bucketSize),
            priceMid: round(overallLow + (i + 0.5) * bucketSize),
            volume: 0,
        }));
        for (const candle of candles) {
            const dayRange = candle.high - candle.low;
            // Which overall buckets does this day's [low, high] range overlap?
            const startBucket = Math.max(0, Math.floor((candle.low - overallLow) / bucketSize));
            const endBucket = Math.min(bucketCount - 1, Math.floor((candle.high - overallLow) / bucketSize));
            if (dayRange <= 0 || startBucket === endBucket) {
                // Flat/near-flat day — all volume goes in the one bucket its
                // price actually falls in, rather than dividing by a ~0 range.
                const b = Math.min(bucketCount - 1, Math.max(0, Math.floor((candle.close - overallLow) / bucketSize)));
                buckets[b].volume += candle.volume;
                continue;
            }
            // Distribute proportional to how much of the day's range each
            // overlapped bucket covers.
            for (let b = startBucket; b <= endBucket; b++) {
                const overlapLow = Math.max(candle.low, buckets[b].priceLow);
                const overlapHigh = Math.min(candle.high, buckets[b].priceHigh);
                const overlapFraction = Math.max(0, overlapHigh - overlapLow) / dayRange;
                buckets[b].volume += candle.volume * overlapFraction;
            }
        }
        for (const b of buckets)
            b.volume = Math.round(b.volume);
        const totalVolume = buckets.reduce((s, b) => s + b.volume, 0);
        const pocIndex = buckets.reduce((best, b, i) => (b.volume > buckets[best].volume ? i : best), 0);
        const pointOfControl = buckets[pocIndex].priceMid;
        const { valueAreaLow, valueAreaHigh } = computeValueArea(buckets, pocIndex, totalVolume);
        return { symbol, exchange, from, to, buckets, pointOfControl, valueAreaLow, valueAreaHigh, totalVolume, caveat: CAVEAT };
    },
};
/** Expands outward from the point-of-control bucket, always taking
 *  whichever neighbor (above or below) has more volume next, until 70% of
 *  total volume is enclosed — the standard "value area" definition. */
function computeValueArea(buckets, pocIndex, totalVolume) {
    const target = totalVolume * 0.7;
    let enclosed = buckets[pocIndex].volume;
    let lo = pocIndex, hi = pocIndex;
    while (enclosed < target && (lo > 0 || hi < buckets.length - 1)) {
        const belowVolume = lo > 0 ? buckets[lo - 1].volume : -1;
        const aboveVolume = hi < buckets.length - 1 ? buckets[hi + 1].volume : -1;
        if (aboveVolume >= belowVolume) {
            hi++;
            enclosed += buckets[hi].volume;
        }
        else {
            lo--;
            enclosed += buckets[lo].volume;
        }
    }
    return { valueAreaLow: buckets[lo].priceLow, valueAreaHigh: buckets[hi].priceHigh };
}
const round = (n) => Math.round(n * 100) / 100;
