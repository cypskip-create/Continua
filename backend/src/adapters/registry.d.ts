/** NSE-only adapter registry. Live transport never uses synthetic mock quotes. */
import type { IExchangeAdapter } from "./types.js";
import type { ExchangeCode } from "../config/index.js";
export declare function getAdapter(exchange: ExchangeCode): IExchangeAdapter;
export declare function getAllAdapters(): IExchangeAdapter[];
