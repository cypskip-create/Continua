export { env } from "./env.js";
export const ACTIVE_EXCHANGES = ["NSE"] as const;
export type ExchangeCode = typeof ACTIVE_EXCHANGES[number];
