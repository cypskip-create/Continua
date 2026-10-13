/** Extract source sentences without adding claims or changing negation. */
export declare function summarizeNews(headline: string, content: string | null | undefined, excerpt: string | null): {
    summary: string;
    methodology: string;
    fullTextAvailable: boolean;
};
