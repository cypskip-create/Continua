import { corporateActionsCollector } from "../collectors/corporateActionsCollector.js";
import { normalizeCorporateAction } from "../../normalization/corporateActions/normalizeCorporateAction.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { ingestionLogRepository } from "../../storage/repositories/ingestionLogRepository.js";
import { deadLetterRepository } from "../../storage/repositories/deadLetterRepository.js";
import { marketEventBus } from "../../streaming/pubsub.js";
import { logger } from "../../monitoring/logger.js";
export async function runCorporateActionsIngestion(adapter, since, symbols) {
    const startedAt = new Date().toISOString();
    const errors = [];
    let stored = 0;
    const [actions, earnings, ownershipResult] = await Promise.all([
        corporateActionsCollector.collectActions(adapter, since),
        corporateActionsCollector.collectEarnings(adapter, since),
        corporateActionsCollector.collectOwnership(adapter, symbols),
    ]);
    const { records: ownership, failures: ownershipFailures } = ownershipResult;
    for (const failure of ownershipFailures) {
        errors.push(`ownership ${failure.symbol}: ${failure.error}`);
        await deadLetterRepository.record({
            exchange: adapter.exchange, dataset: "ownership", symbol: failure.symbol,
            payload: { symbol: failure.symbol }, error: failure.error,
        });
    }
    for (const action of actions) {
        try {
            const normalized = normalizeCorporateAction(action);
            await corporateActionsRepository.upsertCorporateAction(normalized);
            marketEventBus.publishCorporateAction(normalized);
            stored++;
        }
        catch (err) {
            errors.push(`corporate action ${action.id}: ${String(err)}`);
            await deadLetterRepository.record({
                exchange: adapter.exchange, dataset: "corporate_action", symbol: action.securityId,
                payload: action, error: String(err),
            });
        }
    }
    for (const event of earnings) {
        try {
            await corporateActionsRepository.upsertEarningsEvent(event);
            stored++;
        }
        catch (err) {
            errors.push(`earnings event ${event.id}: ${String(err)}`);
            await deadLetterRepository.record({
                exchange: adapter.exchange, dataset: "earnings", symbol: event.securityId,
                payload: event, error: String(err),
            });
        }
    }
    if (ownership.length) {
        try {
            await corporateActionsRepository.upsertOwnership(ownership);
            stored += ownership.length;
        }
        catch (err) {
            errors.push(`ownership batch: ${String(err)}`);
            await deadLetterRepository.record({
                exchange: adapter.exchange, dataset: "ownership", symbol: null,
                payload: ownership, error: String(err),
            });
        }
    }
    await ingestionLogRepository.log({
        exchange: adapter.exchange, dataset: "corporate_action",
        status: errors.length === 0 ? "success" : (stored > 0 ? "partial" : "failed"),
        recordCount: stored, errorCount: errors.length,
        startedAt, finishedAt: new Date().toISOString(),
        errors: errors.length ? errors.slice(0, 20) : undefined,
    });
    if (errors.length)
        logger.warn({ exchange: adapter.exchange, errorCount: errors.length }, "Corporate actions ingestion completed with errors");
}
