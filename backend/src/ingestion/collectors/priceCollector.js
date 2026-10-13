import { withRetry } from "../retry.js";
export const priceCollector = {
    async collectQuotes(adapter, symbols = []) {
        return withRetry(() => adapter.getQuotes(symbols), { label: `${adapter.exchange}.getQuotes` });
    },
};
