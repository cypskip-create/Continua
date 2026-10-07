export interface BriefingInputs {
  symbol: string;
  latest?: { fiscalYear: number; revenue: number | null; netIncome: number | null; eps: number | null } | null;
  prior?: { fiscalYear: number; revenue: number | null; netIncome: number | null; eps: number | null } | null;
  ratios?: { roe?: number | null; netMargin?: number | null; debtToEquity?: number | null; dividendYield?: number | null } | null;
}
export function buildCompanyBriefing({ symbol, latest, prior, ratios }: BriefingInputs) {
  const strengths: string[] = [];
  const risks: string[] = [];
  const facts: string[] = [];
  if (latest && prior && latest.fiscalYear === prior.fiscalYear + 1) {
    for (const [key, label] of [["revenue", "Revenue"], ["netIncome", "Net income"], ["eps", "EPS"]] as const) {
      const current = latest[key], previous = prior[key];
      if (current == null || previous == null || previous === 0 || !Number.isFinite(current) || !Number.isFinite(previous)) continue;
      const change = (current - previous) / Math.abs(previous) * 100;
      const fact = `${label} ${change >= 0 ? "increased" : "decreased"} ${Math.abs(change).toFixed(1)}% in FY${latest.fiscalYear} versus FY${prior.fiscalYear}.`;
      facts.push(fact);
      (change >= 0 ? strengths : risks).push(fact);
    }
  }
  if (ratios?.roe != null && Number.isFinite(ratios.roe)) facts.push(`Reported return on equity is ${(ratios.roe * 100).toFixed(1)}%.`);
  if (ratios?.netMargin != null && Number.isFinite(ratios.netMargin)) facts.push(`Net margin is ${(ratios.netMargin * 100).toFixed(1)}%.`);
  if (ratios?.debtToEquity != null && Number.isFinite(ratios.debtToEquity)) {
    const fact = `Debt is ${(ratios.debtToEquity * 100).toFixed(1)}% of shareholder equity.`;
    facts.push(fact);
    if (ratios.debtToEquity > 1) risks.push(fact);
  }
  if (ratios?.dividendYield != null && Number.isFinite(ratios.dividendYield)) facts.push(`Trailing dividend yield is ${(ratios.dividendYield * 100).toFixed(1)}%.`);
  if (latest?.netIncome != null && latest.netIncome < 0) risks.push(`The latest annual period records a net loss.`);
  return {
    title: `${symbol} fundamental briefing`,
    methodology: "Calculated from reported annual statements and current ratios. Growth comparisons require consecutive fiscal years.",
    facts, strengths, risks,
    coverage: latest ? `Latest annual period: FY${latest.fiscalYear}` : "Annual financial statements are not on file yet.",
  };
}
