export type PaidPlan = 'premium' | 'premium_plus';
export const PLANS = {
  premium: { name: 'Premium', monthly: 800, annual: 7980, features: ['Everything in Free', 'All expanded Forecast research and unlimited Fundamentals', 'Advanced portfolio analysis', '20 advanced price, daily-change, volume and financial alerts', 'Engine Briefing, Forecast, News, Earnings & Reports, Valuation, Ownership and Evidence'] },
  premium_plus: { name: 'Premium Plus', monthly: 1000, annual: 9960, features: ['Everything in Premium', '50 advanced alerts, including material research changes and data freshness', 'Full company and analysis Engine', 'Scenario, benchmark, replay and factor research labs', 'Portfolio stress, bond and futures risk calculators', 'Private forecast notebook and opt-in research personalization', 'Technical research, peers, portfolio, monitoring, journal, events, optimization and backtesting'] },
} as const;
export const hasResearchAccess = (plan: string | null | undefined) => plan === 'premium' || plan === 'premium_plus';
export const hasFullEngineAccess = (plan: string | null | undefined) => plan === 'premium_plus';
export const premiumEngineTools: readonly string[] = ['Briefing', 'Forecast', 'News', 'Earnings & Reports', 'Valuation', 'Ownership', 'Evidence', 'Monitoring', 'Risk Intelligence', 'Factors', 'Macro', 'Events', 'Liquidity', 'Research case'];
export const canUseEngineTool = (plan: string | null | undefined, tool: string) =>
  ['Macro','Events','Liquidity'].includes(tool) || hasFullEngineAccess(plan) || (plan === 'premium' && premiumEngineTools.includes(tool));
