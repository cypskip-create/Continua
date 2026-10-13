/** Explain a linked article's topic without claiming a price forecast. */
export declare function newsImpact(headline: string, excerpt: string | null, symbols: string[]): {
    topic: string;
    reason: string;
    symbols: string[];
    methodology: string;
} | null;
