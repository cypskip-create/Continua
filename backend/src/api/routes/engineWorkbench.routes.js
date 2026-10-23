import {institutionalRoutes} from './institutional.routes.js';
import { Router } from "express";
import {rateLimit,ipKeyGenerator} from 'express-rate-limit';
import {BoundedMemoryRateStore} from '../middleware/sharedRateStore.js';
import {rateLimitClientIP} from '../middleware/edgeClientIdentity.js';
import { investmentEvidence, calculateInvestment } from '../../services/research/investmentResearch.js';
import { z } from "zod";
import { StressSchema, BondLabSchema, FuturesLabSchema } from '../../services/research/engineLabSchemas.js';
import { stressPortfolio, bondRisk, futuresRisk } from '../../services/research/engineRiskLab.js';
import { calculateWithRuntime, pythonCalculation } from '../../services/research/pythonCalculations.js';
import { ACTIVE_EXCHANGES, env } from "../../config/index.js";
import { requirePremiumPlus, requireEngineUser, requireSubscriber } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { engineRepository } from "../../storage/repositories/engineRepository.js";
import { EnginePreferencesSchema, researchRecommendations } from "../../services/research/enginePreferences.js";
import { AdvancedResearchSchema, advancedResearch, CalendarDate } from '../../services/research/advancedResearch.js';
import { getEngineBundle } from "../../services/research/engineBundle.js";
import { getPortfolioOverview, getPortfolioResearch, getPeers } from "../../services/research/engineWorkspace.js";
import { askEngine } from "../../services/research/engineAssistant.js";
import { query } from "../../storage/db.js";
import { monitoringKinds } from "../../services/research/engineMonitoring.js";
import { runEngineMonitoringOnce } from "../../workers/engineMonitorWorker.js";
import { earningsSensitivity, EarningsSensitivitySchema } from '../../services/research/earningsSensitivity.js';
import { annualRatioAt } from '../../services/technical/valuationHistory.js';
import { runHealthCheck } from '../../monitoring/healthCheck.js';
export const engineWorkbenchRoutes = Router();
engineWorkbenchRoutes.use(rateLimit({windowMs:60000,limit:120,standardHeaders:false,legacyHeaders:false,store:new BoundedMemoryRateStore(),keyGenerator:(req,res)=>ipKeyGenerator(rateLimitClientIP(req,res))}));
engineWorkbenchRoutes.use(institutionalRoutes);
engineWorkbenchRoutes.post('/engine/labs/intelligence', requirePremiumPlus, asyncHandler(async (req,res) => {
    const owned = await getPortfolioResearch(String(res.locals.engineUserId), 'NSE');
    if (!owned.riskIntelligence) throw new ApiError(503,'Risk calculation unavailable.');
    const result = await pythonCalculation('risk_simulation', [owned.riskIntelligence, req.body]);
    res.setHeader('Cache-Control','no-store');
    if (result.status !== 200) throw new ApiError(400,result.error);
    res.json({data:result.data});
}));

const exchangeSchema = z.enum(ACTIVE_EXCHANGES).default("NSE");
const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,20}$/);
const user = (res) => String(res.locals.engineUserId);
const handle = (fn) => asyncHandler(async (req, res) => { try {
    await fn(req, res);
}
catch (error) {
    if (error.code === "42P01")
        throw new ApiError(503, "Engine persistence requires the latest database migration. Ask the administrator to deploy it.");
    throw error;
} });
const parse = (schema, value) => { const result = schema.safeParse(value); if (!result.success)
    throw new ApiError(400, "Invalid Engine request: " + result.error.issues.map(i => i.message).join(", ")); return result.data; };
engineWorkbenchRoutes.get('/engine/investment/evidence', requireEngineUser, handle(async(req,res)=>{
    const input=parse(z.object({kind:z.enum(['macro','event','financial_extension']),asOf:CalendarDate,symbol:symbolSchema.optional(),scope:z.enum(['all','held','watched']).optional()}),req.query);
    if(input.asOf>new Date().toISOString().slice(0,10)) throw new ApiError(400,'Use a historical or current cutoff.');
    const basic=!['premium','premium_plus'].includes(res.locals.enginePlan);
    if(basic&&input.kind==='financial_extension')throw new ApiError(403,'Detailed financial evidence requires Premium.');
    if(basic&&input.asOf!==new Date().toISOString().slice(0,10))throw new ApiError(403,'Historical macro and event research requires Premium.');
    if(input.scope&&input.scope!=='all'&&(input.kind!=='event'||res.locals.enginePlan!=='premium_plus'))throw new ApiError(403,'Portfolio and watchlist event research requires Premium Plus.');
    let observations=await investmentEvidence(input.kind,input.asOf,input.symbol);
    if(input.scope&&input.scope!=='all'){
        const rows=await query(input.scope==='held'?'SELECT upper(symbol) AS symbol FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0':'SELECT DISTINCT upper(symbol) AS symbol FROM public.watchlists WHERE user_id=$1',[user(res)]);
        const symbols=new Set(rows.rows.map(row=>row.symbol));observations=observations.filter(event=>symbols.has(event.symbol));
    }
    if(basic&&input.kind==='event'){
        const from=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
        observations=observations.filter(e=>e.date>=from||e.effectiveDate>=input.asOf).map(e=>Object.fromEntries(['id','date','availableAt','sourceUrl','title','type','effectiveDate','status'].map(k=>[k,e[k]])));
    }
    res.setHeader('Cache-Control','no-store');
    if(input.kind==='financial_extension'){res.json({data:{observations,asOf:input.asOf,methodology:'Verified source-linked industry and segment observations. Missing fields are not inferred from sector membership.'}});return;}
    res.json({data:input.kind==='macro'?await calculateInvestment({kind:'macro',asOf:input.asOf,observations,basic}):{events:observations,asOf:input.asOf,methodology:'Verified source-backed revisions available at cutoff. An empty calendar means no eligible evidence was stored, not that no event occurred.'}});
}));
engineWorkbenchRoutes.post('/engine/investment/calculate', requirePremiumPlus, handle(async(req,res)=>{
    // Full validation lives in the shared Python model for both API runtimes.
    const input=parse(z.object({kind:z.enum(['macro','factors','factor-model','macro-scenario','event-impact','financial-extension','optimization','backtest'])}).passthrough(),req.body);
    res.setHeader('Cache-Control','no-store');
    res.json({data:await calculateInvestment(input,user(res))});
}));
engineWorkbenchRoutes.post('/engine/investment/optimize-owned', requirePremiumPlus, handle(async(req,res)=>{
    const options=parse(z.object({objective:z.enum(['minimum-variance','risk-parity','maximum-diversification']),turnoverCap:z.number().min(0).max(1),cashMaximum:z.number().min(0).max(1).optional(),maximum:z.record(z.number().min(0).max(1)).optional(),minimum:z.record(z.number().min(0).max(1)).optional(),excluded:z.array(symbolSchema).max(70).optional(),sectorLimits:z.record(z.object({min:z.number().min(0).max(1),max:z.number().min(0).max(1)})).optional()}).strict(),req.body);
    const portfolio=await getPortfolioResearch(user(res),'NSE'),risk=portfolio.riskIntelligence;
    if(!risk?.covariance||risk.coverage.some(r=>!r.included)||risk.overview.riskCoveredValue!==risk.overview.coveredValue) throw new ApiError(422,'Every holding requires eligible aligned history before optimization. Inspect Risk Intelligence coverage.');
    const configuration={...options,kind:'optimization',symbols:risk.symbols,currentWeights:risk.weights,covariance:risk.covariance,observations:risk.evidence.observations,sectors:Object.fromEntries(risk.overview.positions.map(p=>[p.symbol,p.sector]))};
    const result=await calculateInvestment(configuration,user(res));
    res.setHeader('Cache-Control','no-store');res.json({data:{...result,configuration,evidence:risk.evidence}});
}));
engineWorkbenchRoutes.get('/engine/investment/simulations', requirePremiumPlus, handle(async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.json({data:(await query('SELECT id,name,kind,snapshot_id,created_at FROM market.investment_simulations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 25',[user(res)])).rows});
}));
engineWorkbenchRoutes.get('/engine/investment/coverage', requirePremiumPlus, handle(async(_req,res)=>{
    const securities=(await query('SELECT payload FROM market.investment_coverage_rows() payload')).rows.map(r=>r.payload);
    const sources=(await query(`SELECT s.id,s.enabled,s.redistribution_allowed AS "redistributionAllowed",max(a.retrieved_at) AS "lastRetrieved",
      (SELECT count(*)::int FROM scraping.dead_letters d WHERE d.source_id=s.id) AS "recordedFailures"
      FROM scraping.sources s LEFT JOIN scraping.raw_artifacts a ON a.source_id=s.id GROUP BY s.id ORDER BY s.id`)).rows;
    res.setHeader('Cache-Control','no-store');res.json({data:{securities,sources,checkedAt:new Date().toISOString(),methodology:'All registered NSE securities, including suspended and delisted names. Counts are stored coverage, not a declaration of complete corporate actions or historical universe. Unobserved fiscal years use known listing dates; unknown listing dates do not produce invented gaps. Publication dates and mapped publisher observations remain distinct.'}});
}));
engineWorkbenchRoutes.get('/engine/investment/event-preferences', requirePremiumPlus, handle(async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');res.json({data:(await query('SELECT enabled,held,watched,macro FROM market.investment_event_preferences WHERE user_id=$1',[user(res)])).rows[0]??{enabled:false,held:true,watched:true,macro:false}});
}));
engineWorkbenchRoutes.post('/engine/investment/event-preferences', requirePremiumPlus, handle(async(req,res)=>{
    const input=parse(z.object({enabled:z.boolean(),held:z.boolean(),watched:z.boolean(),macro:z.boolean()}).strict(),req.body);
    await query(`INSERT INTO market.investment_event_preferences(user_id,enabled,held,watched,macro) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,held=EXCLUDED.held,watched=EXCLUDED.watched,macro=EXCLUDED.macro,
      enabled_at=CASE WHEN EXCLUDED.enabled AND NOT investment_event_preferences.enabled THEN now() ELSE investment_event_preferences.enabled_at END`,[user(res),input.enabled,input.held,input.watched,input.macro]);
    res.setHeader('Cache-Control','no-store');res.json({data:input});
}));
engineWorkbenchRoutes.post('/engine/investment/simulations', requirePremiumPlus, handle(async(req,res)=>{
    const input=parse(z.object({name:z.string().trim().min(1).max(100),configuration:z.object({kind:z.enum(['optimization','backtest'])}).passthrough()}),req.body);
    const result=await calculateInvestment(input.configuration,user(res));
    const saved=await query('SELECT market.save_investment_simulation($1,$2,$3,$4,$5::jsonb,$6::jsonb) AS receipt',[user(res),input.name,input.configuration.kind,result.snapshotId,JSON.stringify(input.configuration),JSON.stringify(result)]);
    if(!saved.rows[0]?.receipt)throw new ApiError(422,'Simulation storage limit reached (25 per account), or snapshot too large. Export or remove an old simulation.');
    res.setHeader('Cache-Control','no-store');res.status(201).json({data:saved.rows[0].receipt});
}));
engineWorkbenchRoutes.get('/engine/investment/simulations/:id',requirePremiumPlus,handle(async(req,res)=>{
    const id=parse(z.string().uuid(),req.params.id);
    const row=(await query('SELECT id,name,kind,snapshot_id,configuration,result,created_at FROM market.investment_simulations WHERE user_id=$1 AND id=$2',[user(res),id])).rows[0];
    if(!row)throw new ApiError(404,'Simulation not found.');res.setHeader('Cache-Control','no-store');res.json({data:row});
}));
engineWorkbenchRoutes.delete('/engine/investment/simulations/:id',requirePremiumPlus,handle(async(req,res)=>{
    const id=parse(z.string().uuid(),req.params.id);
    const rows=await query('DELETE FROM market.investment_simulations WHERE user_id=$1 AND id=$2 RETURNING id',[user(res),id]);
    if(!rows.rows.length)throw new ApiError(404,'Simulation not found.');res.setHeader('Cache-Control','no-store');res.json({data:{deleted:true}});
}));
engineWorkbenchRoutes.post('/engine/labs/advanced', requirePremiumPlus, handle(async (req, res) => {
    const input = parse(AdvancedResearchSchema, req.body);
    try {
        res.json({ data: advancedResearch(input) });
    }
    catch (e) {
        throw new ApiError(422, e instanceof Error ? e.message : 'Research inputs require review.');
    }
}));
engineWorkbenchRoutes.get('/engine/labs/history-inputs', requirePremiumPlus, handle(async (req, res) => {
    const b = parse(z.object({ symbol: symbolSchema, start: CalendarDate, end: CalendarDate }).refine(v => v.start < v.end && v.end <= new Date().toISOString().slice(0, 10) && Date.parse(v.end) - Date.parse(v.start) <= 6 * 366 * 86400000, 'Use an ordered past window of at most six years'), req.query);
    const rows = await query(`SELECT DISTINCT ON(bar_time::date) bar_time::date::text AS date,close,source_url AS "sourceUrl",(SELECT currency FROM market.securities WHERE id=$1) AS currency FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time>=$2::date AND bar_time<$3::date+interval '1 day' AND close>0 AND source_url LIKE 'https://%' ORDER BY bar_time::date,bar_time DESC LIMIT 1501`, ['NSE:' + b.symbol, b.start, b.end]);
    if (rows.rows.length > 1500)
        throw new ApiError(400, 'Reduce the window to at most 1500 observed sessions.');
    if (rows.rows.length < 2)
        throw new ApiError(422, 'Fewer than two source-backed price observations are stored for this window. Missing sessions are not invented.');
    res.json({ data: { symbol: b.symbol, points: rows.rows.map(({ date, close }) => ({ date, close })), observations:rows.rows.map(({date,close,sourceUrl,currency})=>({date,close,sourceUrl,currency:currency??null})),currency:rows.rows[0]?.currency??null, sourceUrls: [...new Set(rows.rows.map(r => r.sourceUrl))], basis: 'Stored source-linked raw price closes; corporate-action completeness and benchmark compatibility require separate verification.' } });
}));
engineWorkbenchRoutes.get('/engine/recommendations', requirePremiumPlus, handle(async (_req, res) => { res.json({ data: researchRecommendations(await engineRepository.preferences(user(res))) }); }));
engineWorkbenchRoutes.get('/engine/financial-versions', requireSubscriber, handle(async (req, res) => {
    const symbol = parse(symbolSchema, req.query.symbol);
    const rows = await query('SELECT id,table_name,period_id,operation,before_payload,after_payload,recorded_at,transaction_id FROM market.financial_version_audit WHERE security_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 100', ['NSE:' + symbol]);
    res.json({ data: { versions: rows.rows, methodology: 'Canonical changes recorded from deployment onward. Recorded time is not the original filing/publication date. This audit preserves prior values but does not identify or approve issuer restatements; conflicting documents still require review.' } });
}));
engineWorkbenchRoutes.get('/engine/pipeline-health', requirePremiumPlus, handle(async (_req, res) => {
    const health = await runHealthCheck();
    const validations = await query(`SELECT outcome,count(*)::int AS count,max(validated_at) AS latest FROM
  (SELECT DISTINCT ON(extraction_id) outcome,validated_at FROM market.document_validations ORDER BY extraction_id,validated_at DESC,validator_version DESC) latest GROUP BY outcome`);
    res.json({ data: { checkedAt: health.timestamp, status: health.status, checks: Object.entries(health.checks).map(([name, v]) => ({ name, ok: v.ok })), validations: validations.rows, limits: ['Counts describe recorded validation outcomes, not complete issuer/year coverage.', 'Unsupported OCR and conflicts remain in review; confidence alone cannot approve publication.', 'Always-on hosting and paid AI are disabled by user choice; free-instance sleep remains possible.'], methodology: 'Operational health is separate from financial evidence quality. No private errors, credentials or user activity are returned.' } });
}));
engineWorkbenchRoutes.post('/engine/labs/earnings-sensitivity', requirePremiumPlus, handle(async (req, res) => {
    const b = parse(EarningsSensitivitySchema, req.body), bundle = await getEngineBundle(b.symbol, 'NSE'), q = bundle.quote;
    if (!q || String(q.source) === 'mock' || !Number.isFinite(Date.parse(q.timestamp)) || Date.parse(q.timestamp) > Date.now())
        throw new ApiError(422, 'A dated non-mock quote is required.');
    const dated = annualRatioAt(bundle.history.filter(r => r.sourceUrls?.length), q.lastPrice, q.timestamp, 'pe');
    if (!dated.ratio || !dated.denominator)
        throw new ApiError(422, 'Positive EPS from a source-backed annual filing available on the quote date is required.');
    const eps = dated.denominator;
    const calculation = await calculateWithRuntime('earnings', [eps, q.lastPrice, b.years, b.growthPercent, b.exitPe], () => earningsSensitivity(eps, q.lastPrice, b.years, b.growthPercent, b.exitPe));
    res.json({ data: { ...calculation, symbol: b.symbol, currency: bundle.currency, quoteAsOf: q.timestamp, fiscalYear: dated.fiscalYear, sourceUrls: dated.sourceUrls, snapshotId: bundle.reliability.snapshotId, generatedAt: new Date().toISOString() } });
}));
engineWorkbenchRoutes.post('/engine/labs/stress', requirePremiumPlus, handle(async (req, res) => {
    const body = parse(StressSchema, req.body), portfolio = await getPortfolioOverview(user(res), 'NSE');
    const positions = portfolio.positions.filter(p => p.asOf && Number.isFinite(Date.parse(p.asOf)) && Date.parse(p.asOf) <= Date.now());
    if (!portfolio.available || !positions.length)
        throw new ApiError(422, 'Dated priced holdings are required for portfolio stress');
    const sectors = new Set(positions.map(p => p.sector));
    if (Object.keys(body.sectorShocks).some(s => !sectors.has(s)))
        throw new ApiError(400, 'Select a sector present in your portfolio');
    const calculation = await calculateWithRuntime('stress', [positions, body.marketShock, body.sectorShocks], () => stressPortfolio(positions, body.marketShock, body.sectorShocks));
    res.json({ data: { ...calculation, coverage: portfolio.coverage, datedQuoteCoverage: `${positions.length}/${portfolio.positions.length}`, warnings: [...portfolio.warnings, ...(positions.length !== portfolio.positions.length ? ['Undated or future-dated holdings were excluded from this scenario.'] : [])], generatedAt: new Date().toISOString() } });
}));
engineWorkbenchRoutes.post('/engine/labs/bond', requirePremiumPlus, handle(async (req, res) => { const assumptions = parse(BondLabSchema, req.body); const calculation = await calculateWithRuntime('bond', [assumptions], () => bondRisk(assumptions)); res.json({ data: { ...calculation, assumptions, generatedAt: new Date().toISOString() } }); }));
engineWorkbenchRoutes.post('/engine/labs/futures', requirePremiumPlus, handle(async (req, res) => { const assumptions = parse(FuturesLabSchema, req.body); const calculation = await calculateWithRuntime('futures', [assumptions], () => futuresRisk(assumptions)); res.json({ data: { ...calculation, assumptions, generatedAt: new Date().toISOString() } }); }));
engineWorkbenchRoutes.get("/engine/preferences", requirePremiumPlus, handle(async (_req, res) => { res.json({ data: await engineRepository.preferences(user(res)) }); }));
engineWorkbenchRoutes.post("/engine/preferences", requirePremiumPlus, handle(async (req, res) => { const settings = parse(EnginePreferencesSchema, req.body); res.json({ data: await engineRepository.savePreferences(user(res), settings) }); }));
engineWorkbenchRoutes.post("/engine/interests", requirePremiumPlus, handle(async (req, res) => {
    const body = parse(z.object({ symbol: symbolSchema, exchange: exchangeSchema, reset: z.boolean().optional() }), req.body);
    res.json({ data: await engineRepository.recordInterest(user(res), body.symbol, body.exchange, body.reset) });
}));
engineWorkbenchRoutes.get("/engine/portfolio", requirePremiumPlus, handle(async (req, res) => { res.json({ data: await getPortfolioResearch(user(res), parse(exchangeSchema, req.query.exchange)) }); }));
engineWorkbenchRoutes.get("/engine/portfolio/overview", requireEngineUser, handle(async (req, res) => { res.json({ data: await getPortfolioOverview(user(res), parse(exchangeSchema, req.query.exchange)) }); }));
engineWorkbenchRoutes.post("/engine/cash-flows", requirePremiumPlus, handle(async (req, res) => {
    const b = parse(z.object({ exchange: exchangeSchema, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && v <= new Date().toISOString().slice(0, 10)), amount: z.number().finite().min(-1e12).max(1e12).refine(n => n !== 0), note: z.string().max(160).default("") }), req.body);
    const id = (await query("INSERT INTO public.engine_cash_flows(user_id,exchange,session_date,amount,note) VALUES($1,$2,$3,$4,$5) RETURNING id", [user(res), b.exchange, b.date, b.amount, b.note])).rows[0];
    res.json({ data: id });
}));
engineWorkbenchRoutes.delete("/engine/cash-flows/:id", requirePremiumPlus, handle(async (req, res) => { const id = parse(z.string().uuid(), req.params.id); await query("DELETE FROM public.engine_cash_flows WHERE id=$1 AND user_id=$2", [id, user(res)]); res.json({ data: { deleted: true } }); }));
engineWorkbenchRoutes.get("/engine/peers", requirePremiumPlus, handle(async (req, res) => { res.json({ data: await getPeers(parse(symbolSchema, req.query.symbol), parse(exchangeSchema, req.query.exchange)) }); }));
engineWorkbenchRoutes.get("/engine/monitoring", requirePremiumPlus, handle(async (_req, res) => { res.json({ data: await engineRepository.rules(user(res)) }); }));
engineWorkbenchRoutes.post("/engine/monitoring", requirePremiumPlus, handle(async (req, res) => {
    const rule = parse(z.object({ exchange: exchangeSchema, symbol: symbolSchema, kind: z.enum(monitoringKinds), threshold: z.number().finite().min(-1e9).max(1e9).optional(), enabled: z.boolean().default(true) }).refine(v => v.kind === "material_change" || v.threshold != null, "A numeric threshold is required"), req.body);
    const count = await engineRepository.rules(user(res));
    if (count.length >= 50 && !count.some(r => r.symbol === rule.symbol && r.kind === rule.kind && r.exchange === rule.exchange))
        throw new ApiError(400, "Maximum 50 Engine monitoring rules per account.");
    res.json({ data: await engineRepository.saveRule(user(res), rule) });
}));
engineWorkbenchRoutes.delete("/engine/monitoring/:id", requirePremiumPlus, handle(async (req, res) => { await engineRepository.deleteRule(user(res), parse(z.string().uuid(), req.params.id)); res.json({ data: { deleted: true } }); }));
engineWorkbenchRoutes.post("/engine/monitoring/check", requirePremiumPlus, handle(async (req, res) => { const body = parse(z.object({ symbol: symbolSchema, exchange: exchangeSchema }), req.body); await runEngineMonitoringOnce(user(res), body.symbol, body.exchange); res.json({ data: await engineRepository.rules(user(res)) }); }));
engineWorkbenchRoutes.get("/engine/monitoring/activity", requirePremiumPlus, handle(async (_req, res) => { res.json({ data: (await query("SELECT id,title,message,created_at FROM public.notifications WHERE user_id=$1 AND type='engine' ORDER BY created_at DESC LIMIT 20", [user(res)])).rows }); }));
engineWorkbenchRoutes.get("/engine/usage", requirePremiumPlus, handle(async (_req, res) => { res.json({ data: { ...await engineRepository.aiUsage(user(res)), monthlyApplicationCap: env.ENGINE_AI_MONTHLY_BUDGET_USD, dailyUserLimit: env.ENGINE_AI_USER_DAILY_LIMIT, model: "gpt-5.4-mini", configured: !!env.OPENAI_API_KEY } }); }));
engineWorkbenchRoutes.post("/engine/assistant", requirePremiumPlus, handle(async (req, res) => {
    const body = parse(z.object({ question: z.string().trim().min(3).max(2000), symbols: z.array(symbolSchema).min(1).max(3), exchange: exchangeSchema, scope: z.enum(["company", "portfolio"]).default("company") }), req.body);
    const preferences = await engineRepository.preferences(user(res));
    const evidence = [];
    if (body.scope === "portfolio") {
        const portfolio = await getPortfolioResearch(user(res), body.exchange);
        evidence.push({ id: "portfolio", title: "Your portfolio research", asOf: new Date().toISOString(), url: null, facts: { positions: portfolio.positions, sectors: portfolio.sectors, warnings: portfolio.warnings, performance: portfolio.performance, correlations: portfolio.correlations, risk: portfolio.risk, dividends: portfolio.dividends, researchBriefing: portfolio.researchBriefing, coverage: portfolio.coverage, methodology: portfolio.methodology } });
    }
    else
        for (const symbol of [...new Set(body.symbols)]) {
            const data = await getEngineBundle(symbol, body.exchange);
            const filingUrl = data.diagnostics.trends.at(-1)?.sourceUrls.find(url => /^https:\/\//i.test(url)) ?? null;
            evidence.push({ id: symbol + ":company", title: data.companyName + " financial analysis", asOf: data.quality.filedAt, url: filingUrl, facts: { briefing: data.briefing, quality: data.quality, financial: data.financialAnalysis, diagnostics: data.diagnostics, valuation: data.valuation?.models, scenarios: data.scenarios, missing: data.unavailable } });
            evidence.push({ id: symbol + ":technical", title: symbol + " dated technical observations", asOf: data.quote?.timestamp ?? null, url: null, facts: data.synthesis });
            for (const n of data.news.slice(0, 4))
                evidence.push({ id: symbol + ":news:" + n.id, title: n.headline, asOf: n.publishedAt, url: /^https?:\/\//i.test(n.url) ? n.url : null, facts: { summary: n.summary, methodology: n.methodology } });
        }
    res.json({ data: await askEngine(user(res), body.question, evidence, preferences) });
}));
