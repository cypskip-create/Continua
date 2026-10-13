import { simulateExecution } from "./executionSimulation.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { ApiError } from "../../api/middleware/errorHandler.js";
/** Daily historical execution simulation with next-session fills, costs and volume constraints. */
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { sma, ema, rsi } from "./indicators.js";
export const backtestService = {
    async run(req) {
        const securityId = `${req.exchange}:${req.symbol}`;
        const candles = await candlesRepository.getCandles(securityId, "1d", req.from, req.to);
        if (candles.length < 5)
            return null;
        const { signals, params } = computeSignals(candles, req);
        const actions = await corporateActionsRepository.getBySecurity(securityId);
        if (actions.some(a => (a.type === "split" || a.type === "bonus_issue") && a.status !== "cancelled" && (a.effectiveDate ?? a.exDate ?? "") >= req.from.slice(0, 10) && (a.effectiveDate ?? a.exDate ?? "") <= req.to.slice(0, 10)))
            throw new ApiError(422, "Backtest crosses a corporate action whose historical price adjustment basis is unverified.");
        const options = { feeBps: req.feeBps ?? 20, slippageBps: req.slippageBps ?? 10, initialCapital: req.initialCapital ?? 100000, maxVolumeParticipation: req.maxVolumeParticipation ?? 0.01 };
        const result = simulateExecution(candles, signals, options);
        const trades = result.trades;
        const metrics = { ...computeMetrics(candles, trades), totalReturnPercent: round(result.totalReturnPercent), maxDrawdownPercent: round(result.maxDrawdownPercent) };
        const split = Math.floor(candles.length * 0.7);
        const inSample = simulateExecution(candles.slice(0, split), signals.slice(0, split), options);
        const test = simulateExecution(candles.slice(split), signals.slice(split), options);
        return {
            symbol: req.symbol, exchange: req.exchange, strategy: req.strategy, params,
            from: req.from, to: req.to, trades, metrics, execution: { ...options, skipped: result.skipped, openPosition: result.openPosition }, evaluation: { inSampleReturn: inSample.totalReturnPercent, outOfSampleReturn: candles.length - split >= 20 ? test.totalReturnPercent : null, splitDate: candles[split]?.timestamp ?? null }, caveat: "Prior-session signals execute at the next session open. Includes configured fees and slippage; rejects orders above configured session-volume participation. Open positions are marked to the final close. Historical volume is a coarse execution constraint, not order-book simulation. Dividends and taxes are excluded; 70/30 chronological evaluation is not a forecast.",
        };
    },
};
function computeSignals(candles, req) {
    const n = candles.length;
    if (req.strategy === "sma_cross" || req.strategy === "ema_cross") {
        const fastPeriod = req.fastPeriod ?? 10;
        const slowPeriod = req.slowPeriod ?? 30;
        const calc = req.strategy === "sma_cross" ? sma : ema;
        const fastLine = calc(candles, fastPeriod);
        const slowLine = calc(candles, slowPeriod);
        const signals = new Array(n).fill("hold");
        for (let i = 1; i < n; i++) {
            const f0 = fastLine[i - 1], f1 = fastLine[i], s0 = slowLine[i - 1], s1 = slowLine[i];
            if (f0 == null || f1 == null || s0 == null || s1 == null)
                continue;
            if (f0 <= s0 && f1 > s1)
                signals[i] = "buy";
            else if (f0 >= s0 && f1 < s1)
                signals[i] = "sell";
        }
        return { signals, params: { fastPeriod, slowPeriod } };
    }
    // rsi_reversion: buy when RSI crosses up out of oversold, sell when it
    // crosses down out of overbought — a classic mean-reversion rule, not a
    // trend-following one like the crossover strategies above.
    const rsiPeriod = req.rsiPeriod ?? 14;
    const oversold = req.oversold ?? 30;
    const overbought = req.overbought ?? 70;
    const rsiLine = rsi(candles, rsiPeriod);
    const signals = new Array(n).fill("hold");
    for (let i = 1; i < n; i++) {
        const r0 = rsiLine[i - 1], r1 = rsiLine[i];
        if (r0 == null || r1 == null)
            continue;
        if (r0 <= oversold && r1 > oversold)
            signals[i] = "buy";
        else if (r0 >= overbought && r1 < overbought)
            signals[i] = "sell";
    }
    return { signals, params: { rsiPeriod, oversold, overbought } };
}
function computeMetrics(candles, trades) {
    const totalReturnPercent = round(trades.reduce((compound, t) => compound * (1 + t.returnPercent / 100), 1) * 100 - 100);
    const wins = trades.filter((t) => t.returnPercent > 0).length;
    const winRate = trades.length > 0 ? round((wins / trades.length) * 100) : null;
    const averageHoldingDays = trades.length > 0 ? round(trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length) : null;
    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    const buyHoldReturnPercent = round(((last - first) / first) * 100);
    // Max drawdown of the STRATEGY's equity curve (not buy-and-hold's).
    // Equity is 1.0 at the start; each closed trade compounds it. While a
    // position is open, equity is marked to market using the running price
    // against that trade's entry, scaled by whatever equity existed when
    // the trade was opened (so a drawdown inside trade #3 is measured
    // against the equity built up by trades #1 and #2, not from scratch).
    let closedEquity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    let tradeIdx = 0;
    let inPosition = false;
    let entryPrice = 0;
    let equityAtEntry = 1;
    for (const candle of candles) {
        if (!inPosition && tradeIdx < trades.length && candle.timestamp === trades[tradeIdx].entryDate) {
            inPosition = true;
            entryPrice = trades[tradeIdx].entryPrice;
            equityAtEntry = closedEquity;
        }
        if (inPosition) {
            const currentEquity = equityAtEntry * (1 + (candle.close - entryPrice) / entryPrice);
            peak = Math.max(peak, currentEquity);
            maxDrawdown = Math.max(maxDrawdown, (peak - currentEquity) / peak);
        }
        if (inPosition && tradeIdx < trades.length && candle.timestamp === trades[tradeIdx].exitDate) {
            closedEquity = equityAtEntry * (1 + trades[tradeIdx].returnPercent / 100);
            peak = Math.max(peak, closedEquity);
            inPosition = false;
            tradeIdx++;
        }
    }
    return {
        totalTrades: trades.length, winRate, totalReturnPercent, buyHoldReturnPercent,
        maxDrawdownPercent: round(maxDrawdown * 100), averageHoldingDays,
    };
}
function daysBetween(a, b) {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
const round = (n) => Math.round(n * 100) / 100;
