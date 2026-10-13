import { startServer } from "./api/server.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { logger } from "./monitoring/logger.js";
import {startMemoryDiagnostics} from './monitoring/memoryDiagnostics.js';
startMemoryDiagnostics();
startServer();
startScheduler().catch((err) => logger.error({ err }, "Failed to start scheduler"));
process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled rejection");
});
process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
});
