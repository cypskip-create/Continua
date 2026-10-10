/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import { getAllAdapters } from "../adapters/registry.js";
import { runIndexIngestion } from "../ingestion/pipelines/indexIngestionPipeline.js";
import { isMarketOpen } from "../config/tradingCalendar.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

let intervalHandle: NodeJS.Timeout | null = null;

export interface RunOnceOptions {
  respectTradingCalendar?: boolean;
}

export async function runIndexIngestionOnce(options: RunOnceOptions = {}): Promise<void> {
  const { respectTradingCalendar = true } = options;
  for (const adapter of getAllAdapters()) {
    try {
      // NSE's published closing summary can arrive after trading ends. It is
      // already dated by the publisher and must also be ingested on weekends.
      if (respectTradingCalendar && adapter.exchange !== 'NSE' && !isMarketOpen(adapter.exchange)) {
        logger.debug({ exchange: adapter.exchange }, "Market closed — skipping index ingestion tick");
        continue;
      }
      await runIndexIngestion(adapter);
    } catch (err) {
      logger.error({ err, exchange: adapter.exchange }, "Index ingestion pass failed");
    }
  }
}

export function startIndexWorker(): () => void {
  const adapters = getAllAdapters();
  logger.info({ exchanges: adapters.map((a) => a.exchange), intervalMs: env.INDEX_POLL_INTERVAL_MS }, "Starting index worker");

  intervalHandle = setInterval(() => { void runIndexIngestionOnce(); }, env.INDEX_POLL_INTERVAL_MS);

  return () => {
    if (intervalHandle) clearInterval(intervalHandle);
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startIndexWorker();
}
