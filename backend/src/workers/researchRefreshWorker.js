import cron from 'node-cron';
import {pool} from '../storage/db.js';
import {researchService} from '../services/research/researchService.js';
import {ACTIVE_EXCHANGES} from '../config/index.js';
import {logger} from '../monitoring/logger.js';
let running = false;
/** Reuses this process and database; no provider service or ticker worklist. */
export async function runResearchRefreshOnce() {
    if (running) return;
    running = true;
    let client, owned = false, discard = false;
    try {
        client = await pool.connect();
        owned = (await client.query("SELECT pg_try_advisory_lock(hashtextextended('continua-c-score-refresh-v2',0)) AS owned")).rows[0]?.owned === true;
        if (!owned) return;
        for (const exchange of ACTIVE_EXCHANGES) await researchService.recomputeAllForExchange(exchange);
    } catch {discard = true; logger.warn('Scheduled research refresh unavailable; the next bounded run will retry');}
    finally {
        if (owned) await client.query("SELECT pg_advisory_unlock(hashtextextended('continua-c-score-refresh-v2',0))").catch(() => {discard = true;});
        client?.release(discard); running = false;
    }
}
export function startResearchRefreshWorker() {
    void runResearchRefreshOnce();
    return cron.schedule('37 */6 * * *', () => {void runResearchRefreshOnce();}, {timezone: 'UTC'});
}
