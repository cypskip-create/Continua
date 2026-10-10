/** NSE-only adapter registry. Live transport never uses synthetic mock quotes. */
import type { IExchangeAdapter } from "./types.js";
import type { ExchangeCode } from "../config/index.js";
import { NseAdapter } from "./nse/nseAdapter.js";
const registry = new Map<ExchangeCode, IExchangeAdapter>([["NSE", new NseAdapter()]]);
export function getAdapter(exchange: ExchangeCode): IExchangeAdapter {
  const adapter = registry.get(exchange);
  if (!adapter) throw new Error(`Unsupported exchange: ${exchange}. Continua covers NSE only.`);
  return adapter;
}
export function getAllAdapters(): IExchangeAdapter[] { return [...registry.values()]; }
