/** Strict DRAFT extraction for the documented CBK reopened-bond layout.
 * Missing or misaligned columns require manual review, never positional guessing.
 * The signed report date is not silently relabelled as the auction date.
 */
export declare function draftCbkBondReport(text: string, sourceUrl: string): {
    symbol: string | null;
    id: string;
    sourceUrl: string;
    kind: "bond" | "ipo" | "macro" | "economic" | "derivative" | "usp" | "market_statistics";
    title: string;
    observedAt: string;
    payload: {
        status?: "Available" | "To be Listed" | "Listed" | undefined;
        date?: string | undefined;
        price?: number | undefined;
        isin?: string | undefined;
        volume?: number | undefined;
        change?: number | undefined;
        shares?: number | undefined;
        actual?: number | undefined;
        previous?: number | undefined;
        consensus?: number | undefined;
        unit?: string | undefined;
        importance?: number | undefined;
        tenor?: number | undefined;
        coupon?: number | undefined;
        maturity?: string | undefined;
        yield?: number | undefined;
        yieldBasis?: "accepted_auction" | "secondary_market" | undefined;
        indicator?: string | undefined;
        expiry?: string | undefined;
        openInterest?: number | undefined;
        turnover?: number | undefined;
        permissionReference?: string | undefined;
    };
}[];
