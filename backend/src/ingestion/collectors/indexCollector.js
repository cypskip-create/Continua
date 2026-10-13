import { withRetry } from "../retry.js";
export const indexCollector = {
    async collectIndices(adapter) {
        return withRetry(() => adapter.getIndices(), { label: `${adapter.exchange}.getIndices` });
    },
};
