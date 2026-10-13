import { NseAdapter } from "./nse/nseAdapter.js";
const registry = new Map([["NSE", new NseAdapter()]]);
export function getAdapter(exchange) {
    const adapter = registry.get(exchange);
    if (!adapter)
        throw new Error(`Unsupported exchange: ${exchange}. Continua covers NSE only.`);
    return adapter;
}
export function getAllAdapters() { return [...registry.values()]; }
