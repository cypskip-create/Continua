import { query, withTransaction } from "../db.js";
import { ApiError } from "../../api/middleware/errorHandler.js";
import { defaultPreferences, EnginePreferencesSchema, recordInterest } from "../../services/research/enginePreferences.js";
import { fingerprint, changesBetween } from "../../services/research/engineAnalytics.js";
export const engineRepository = {
    async preferences(userId) {
        const result = await query("SELECT settings FROM public.engine_preferences WHERE user_id=$1", [userId]);
        const parsed = EnginePreferencesSchema.safeParse(result.rows[0]?.settings ?? {});
        return parsed.success ? parsed.data : defaultPreferences();
    },
    async savePreferences(userId, settings) {
        return withTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['engine-preferences:' + userId]);
            const existing = await client.query('SELECT settings FROM public.engine_preferences WHERE user_id=$1', [userId]);
            const parsed = EnginePreferencesSchema.safeParse(existing.rows[0]?.settings ?? {});
            // Settings forms may be old; never overwrite server-recorded interests.
            const saved = { ...settings, interests: parsed.success ? parsed.data.interests : [] };
            await client.query("INSERT INTO public.engine_preferences(user_id,settings) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()", [userId, JSON.stringify(saved)]);
            return saved;
        });
    },
    async recordInterest(userId, symbol, exchange, reset = false) {
        return withTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['engine-preferences:' + userId]);
            const existing = await client.query('SELECT settings FROM public.engine_preferences WHERE user_id=$1', [userId]);
            const parsed = EnginePreferencesSchema.safeParse(existing.rows[0]?.settings ?? {});
            const saved = recordInterest(parsed.success ? parsed.data : defaultPreferences(), symbol, exchange, reset);
            await client.query("INSERT INTO public.engine_preferences(user_id,settings) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()", [userId, JSON.stringify(saved)]);
            return saved;
        });
    },
    async observe(securityId, state) {
        return withTransaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["engine-state:" + securityId]);
            const result = await client.query("SELECT payload,captured_at FROM market.engine_snapshots WHERE security_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 2", [securityId]);
            const hash = fingerprint(state), latest = result.rows[0];
            const same = latest && fingerprint(latest.payload) === hash;
            const previous = same ? result.rows[1] : latest;
            if (!same)
                await client.query("INSERT INTO market.engine_snapshots(security_id,fingerprint,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(security_id,fingerprint) DO UPDATE SET captured_at=now()", [securityId, hash, JSON.stringify(state)]);
            return { ...changesBetween(previous?.payload ?? null, state), fingerprint: hash, comparedAsOf: previous?.captured_at ?? null };
        });
    },
    async rules(userId) { return (await query("SELECT id,exchange,symbol,kind,threshold,enabled,last_state FROM market.engine_monitor_rules WHERE user_id=$1 ORDER BY created_at DESC", [userId])).rows; },
    async saveRule(userId, rule) {
        return (await query("INSERT INTO market.engine_monitor_rules(user_id,exchange,symbol,kind,threshold,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,exchange,symbol,kind) DO UPDATE SET threshold=EXCLUDED.threshold,enabled=EXCLUDED.enabled,last_state=NULL RETURNING id,exchange,symbol,kind,threshold,enabled", [userId, rule.exchange, rule.symbol, rule.kind, rule.threshold ?? null, rule.enabled])).rows[0];
    },
    async deleteRule(userId, id) { await query("DELETE FROM market.engine_monitor_rules WHERE id=$1 AND user_id=$2", [id, userId]); },
    async reserveAi(userId, model, amount, monthlyCap, userDailyLimit) {
        return withTransaction(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtext('engine-ai-budget'))");
            const usage = await client.query(`SELECT COALESCE(sum(reserved_usd) FILTER(WHERE created_at>=date_trunc('month',now())),0)::float8 AS spent,
        count(*) FILTER(WHERE user_id=$1 AND created_at>=date_trunc('day',now()))::int AS daily,
        count(*) FILTER(WHERE user_id=$1 AND created_at>now()-interval '1 hour')::int AS hourly FROM market.engine_ai_usage WHERE created_at>=LEAST(date_trunc('month',now()),now()-interval '1 day')`, [userId]);
            const u = usage.rows[0];
            if (u.spent + amount > monthlyCap)
                throw new ApiError(429, "The Engine monthly AI budget is reached. Calculated research remains available.");
            if (u.daily >= userDailyLimit || u.hourly >= 5)
                throw new ApiError(429, "Research assistant request limit reached. Please retry later.");
            return (await client.query("INSERT INTO market.engine_ai_usage(user_id,model,reserved_usd) VALUES($1,$2,$3) RETURNING id", [userId, model, amount])).rows[0].id;
        });
    },
    async finishAi(id, status, input, output) {
        // Retain the reservation on failures/timeouts: the provider may have processed the request.
        await query("UPDATE market.engine_ai_usage SET status=$2,input_tokens=$3,output_tokens=$4 WHERE id=$1", [id, status, input, output]);
    },
    async aiUsage(userId) { return (await query("SELECT count(*)::int AS requests,COALESCE(sum(reserved_usd),0)::float8 AS reserved FROM market.engine_ai_usage WHERE user_id=$1 AND created_at>=date_trunc('month',now())", [userId])).rows[0]; },
};
