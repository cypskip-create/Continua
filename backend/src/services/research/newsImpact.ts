/** Explain a linked article's topic without claiming a price forecast. */
export function newsImpact(headline: string, excerpt: string | null, symbols: string[]) {
  if (!symbols.length) return null;
  const text = `${headline} ${excerpt ?? ""}`;
  const topics: [RegExp, string, string][] = [
    [/\b(cbk|regulat\w*|compliance|fraud|cyber\w*|court|lawsuit)\b/i, "Regulation & risk", "May affect compliance obligations, operating risk or costs."],
    [/\b(dividend|payout|ex-dividend)\b/i, "Shareholder income", "May affect dividend income; verify the company's confirmed payment terms."],
    [/\b(earnings|profit|revenue|results|loss)\b/i, "Financial performance", "May change the financial inputs used in profitability and valuation analysis."],
    [/\b(acquisition|merger|expansion|partnership|stake|rights issue)\b/i, "Company development", "May affect the company's growth, ownership or capital requirements."],
  ];
  const match = topics.find(([pattern]) => pattern.test(text));
  return { topic: match?.[1] ?? "Company news", reason: match?.[2] ?? "The article mentions this holding or a known company brand; assess the source before drawing conclusions.", symbols, methodology: "Issuer/brand matching and rule-based topic classification. Relevance is not a directional price prediction." };
}
