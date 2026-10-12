import { indicesRepository } from "../../storage/repositories/indicesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import type { MarketIndex } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";
import {requestIndexCollection} from '../../workers/indexReaderRefresh.js';

export const indexService = {
  async getIndices(exchange: ExchangeCode): Promise<MarketIndex[]> {
    if(exchange==='NSE')requestIndexCollection();
    return cache.getOrSet(CacheKeys.indices(exchange), 30_000, () => indicesRepository.listByExchange(exchange));
  },
};
