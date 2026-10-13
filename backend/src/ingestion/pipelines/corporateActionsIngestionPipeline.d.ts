/**
 * Corporate actions + earnings + ownership — all slow-moving, event-driven
 * datasets bundled into one daily pipeline (corporateActionsWorker.ts).
 * Corporate actions in particular need to flow into portfolio/yield/return
 * calculations elsewhere in the app, so storing them promptly matters even
 * though they don't change intraday.
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
export declare function runCorporateActionsIngestion(adapter: IExchangeAdapter, since: string, symbols: string[]): Promise<void>;
