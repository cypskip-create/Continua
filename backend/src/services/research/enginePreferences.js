import { z } from "zod";
export const EnginePreferencesSchema = z.object({
    goal: z.enum(["Balanced", "Income", "Growth", "Capital preservation", "Short-term trading"]).default("Balanced"),
    horizon: z.enum(["under_1_year", "1_to_5_years", "over_5_years"]).default("1_to_5_years"),
    experience: z.enum(["beginner", "intermediate", "experienced"]).default("beginner"),
    riskComfort: z.enum(["unspecified", "lower", "moderate", "higher"]).default("unspecified"),
    incomeNeeds: z.enum(["none", "occasional", "regular"]).default("none"),
    sectors: z.array(z.string().trim().min(1).max(60).refine(value => value.length >= 1 && value.length <= 60)).max(12).default([]),
    notifications: z.boolean().default(true),
    learnInterests: z.boolean().default(false),
    interests: z.array(z.object({ symbol: z.string().regex(/^[A-Z0-9.\-]{1,20}$/), exchange: z.string().max(10).refine(value => value.length <= 10), visits: z.number().int().min(0).max(10000), lastSeen: z.string().datetime().optional() })).max(30).default([]),
}).strict();
export const defaultPreferences = () => EnginePreferencesSchema.parse({});
export function recordInterest(settings, symbol, exchange, reset = false, now = new Date()) {
    if (reset)
        return { ...settings, interests: [] };
    if (!settings.learnInterests)
        return settings;
    const interests = settings.interests.map(i => ({ ...i })), current = interests.find(i => i.symbol === symbol && i.exchange === exchange);
    // One observation per company per UTC day, so reloads cannot dominate learning.
    if (current?.lastSeen?.slice(0, 10) === now.toISOString().slice(0, 10))
        return settings;
    if (current) {
        current.visits = current.lastSeen ? Math.min(current.visits + 1, 10000) : 1;
        current.lastSeen = now.toISOString();
    }
    else
        interests.unshift({ symbol, exchange, visits: 1, lastSeen: now.toISOString() });
    return { ...settings, interests: interests.slice(0, 30) };
}
export function researchRecommendations(settings, now = new Date()) {
    const start = settings.goal === 'Income' ? ['Earnings & Reports', 'Valuation', 'Evidence'] : settings.goal === 'Growth' ? ['Forecast', 'Earnings & Reports', 'Evidence'] : settings.goal === 'Capital preservation' ? ['Evidence', 'Risk lab', 'Portfolio'] : ['Evidence', 'Briefing', 'Forecast'];
    const companies = settings.learnInterests ? settings.interests.filter(i => i.visits > 0 && i.lastSeen && Date.parse(i.lastSeen) <= now.getTime()).map(i => ({ ...i, score: i.visits * Math.pow(.5, Math.max(0, now.getTime() - Date.parse(i.lastSeen)) / 86400000 / 30) })).sort((a, b) => b.score - a.score).slice(0, 5) : [];
    return { tools: start, companies: companies.map(({ symbol, exchange, visits }) => ({ symbol, exchange, reason: `Opened on ${visits} research day(s); recent interest is weighted more strongly.` })), reason: `Research shortcuts for your explicitly selected ${settings.goal.toLowerCase()} focus.`, methodology: 'Opt-in company interests use a 30-day half-life and one observation per company per day. No inference of wealth, suitability or risk tolerance; no financial model retraining. Disable learning to hide learned suggestions; reset to remove the saved interests.' };
}
