import type { MarketIndex } from '../../types/market.js';
/** Only the enabled official collector's dated/validated closing observations
 * can extend the history chart. No interpolation or scrape-time substitution. */
export declare function publishNseIndexHistory(indices: MarketIndex[]): Promise<void>;
