import { withRetry } from "../retry.js";
export const corporateActionsCollector = {
    async collectActions(adapter, since) {
        return withRetry(() => adapter.getCorporateActions(null, since), { label: `${adapter.exchange}.getCorporateActions` });
    },
    async collectEarnings(adapter, since) {
        return withRetry(() => adapter.getEarningsEvents(null, since), { label: `${adapter.exchange}.getEarningsEvents` });
    },
    async collectOwnership(adapter, symbols) {
        const results = await Promise.allSettled(symbols.map((s) => withRetry(() => adapter.getOwnership(s), { label: `${adapter.exchange}.getOwnership(${s})` })));
        const records = [];
        const failures = [];
        results.forEach((r, i) => {
            if (r.status === "fulfilled")
                records.push(...r.value);
            else
                failures.push({ symbol: symbols[i], error: String(r.reason) });
        });
        return { records, failures };
    },
};
