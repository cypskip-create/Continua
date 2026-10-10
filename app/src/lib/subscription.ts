export type PaidPlan = 'premium' | 'premium_plus';
export const PLANS = {
  premium: { name: 'Premium', monthly: 800, annual: 7980, features: ['Everything in Free', 'Expanded stock research and unlimited Fundamentals', 'Advanced portfolio analysis', 'Engine Briefing and basic Forecast views'] },
  premium_plus: { name: 'Premium Plus', monthly: 1000, annual: 9960, features: ['Everything in Premium', 'Full company and analysis Engine', 'Scenario labs, technical research and peer tools', 'Engine portfolio, monitoring, journal and Ask Engine'] },
} as const;
export const hasResearchAccess = (plan: string | null | undefined) => plan === 'premium' || plan === 'premium_plus';
export const hasFullEngineAccess = (plan: string | null | undefined) => plan === 'premium_plus';
