import { indicesRepository } from "../../storage/repositories/indicesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { requestIndexCollection } from '../../workers/indexReaderRefresh.js';
export const indexService = {
    async getIndices(exchange) {
        if (exchange === 'NSE')
            requestIndexCollection();
        const rows=await cache.getOrSet(CacheKeys.indices(exchange), 30_000, () => indicesRepository.listByExchange(exchange));
        return exchange==='NSE'?rows.filter(row=>['NASI','NSE20','NSE25'].includes(row.code)):rows;
    },
};
