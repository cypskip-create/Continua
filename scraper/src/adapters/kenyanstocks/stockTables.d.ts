export declare function publisherNumber(raw: string): {
    value: number | null;
    unit: string | null;
    approximate: boolean;
};
export declare function publisherDate(raw: string): string | null;
/** All columns, including horizontally off-screen years, retain original labels.
 * These are publisher observations, not an approved issuer statement. */
export declare function extractStockTables(html: string, tab: string, category: string | null): unknown[];
