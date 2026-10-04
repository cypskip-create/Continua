import type { IExchangeAdapter, FundamentalsBundle } from "../../adapters/types.js";
import { withRetry } from "../retry.js";

export interface FundamentalsCollectionResult {
  bundles: FundamentalsBundle[];
  failures: { symbol: string; error: string }[];
}

export const fundamentalsCollector = {
  /** Per-symbol failures are returned, not swallowed — Promise.allSettled
   *  alone would silently drop a symbol that failed every retry. The
   *  pipeline dead-letters these so a persistently-failing symbol is
   *  visible instead of just quietly missing from the next screener run. */
  async collectForSymbols(adapter: IExchangeAdapter, symbols: string[]): Promise<FundamentalsCollectionResult> {
    const results = await Promise.allSettled(
      symbols.map((s) => withRetry(async () => {
        if (adapter.getFundamentalsHistory) return adapter.getFundamentalsHistory(s);
        const latest = await adapter.getFundamentals(s);
        return latest ? [latest] : [];
      }, { label: `${adapter.exchange}.getFundamentals(${s})` }))
    );
    const bundles: FundamentalsBundle[] = [];
    const failures: { symbol: string; error: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        bundles.push(...r.value);
      } else {
        failures.push({ symbol: symbols[i]!, error: String(r.reason) });
      }
    });
    return { bundles, failures };
  },
};
