const CATEGORY_KEYWORDS = {
    markets: [],
    earnings: [
        "earnings", "profit", "net profit", "half-year results", "full-year results",
        "quarterly results", "dividend", "eps", "interim results", "annual results",
        "revenue rose", "revenue fell", "posts a profit", "posts a loss", "pre-tax profit",
    ],
    economy: [
        "central bank", "cbk", "inflation", "gdp", "interest rate", "monetary policy",
        "shilling", "treasury", "budget", "imf", "world bank", "public debt", "fiscal",
        "exchange rate", "forex", "trade deficit", "balance of payments",
        "real estate", "property market", "housing", "mortgage", "rent", "construction",
    ],
    companies: [
        "appoints", "ceo", "board", "acquisition", "merger", "stake", "ipo", "listing",
        "rights issue", "shareholders", "restructuring", "partnership", "expansion",
    ],
};
export function classifyNewsCategory(text) {
    const lower = text.toLowerCase();
    let bestCategory = "markets";
    let bestScore = 0;
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const score = keywords.reduce((count, kw) => (lower.includes(kw) ? count + 1 : count), 0);
        if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
        }
    }
    return bestCategory;
}
