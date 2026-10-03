/**
 * Continua Data — entrypoint. Starts the REST API, the WebSocket
 * streaming server, and all background ingestion workers in one process.
 * At larger scale these three can be split into separate deployables
 * (they don't share in-process state except the pub/sub bus and the
 * in-memory cache, both of which have a documented path to a shared
 * backend — Redis — when that split happens); one process is the right
 * shape for the NSE-first MVP.
 */
import { createServer } from "./api/server.js";
import { startWebSocketServer } from "./streaming/websocketServer.js";
import { startAllWorkers } from "./workers/scheduler.js";
import { env } from "./config/index.js";
import { logger } from "./monitoring/logger.js";

async function main() {
  const app = createServer();
  const httpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Continua Data API listening");
  });

  startWebSocketServer(httpServer);

  let stopWorkers = () => {};
  try {
    stopWorkers = await startAllWorkers();
  } catch (err) {
    // A transient upstream/database failure must not take the health endpoint
    // down after the HTTP server has successfully bound. Render can keep the
    // API healthy while the next deploy/restart retries background workers.
    logger.error({ err }, "Background workers failed to start; API running in degraded mode");
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down…");
    stopWorkers();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
