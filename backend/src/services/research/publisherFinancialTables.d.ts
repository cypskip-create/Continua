/** Source-observed tables are deliberately separate from canonical filings.
 * Exact labels/years/raw precision are preserved; no scope/date/EPS is invented. */
export declare function sourceFinancialTables(raw: unknown): {
    category: string;
    columns: string[];
    rows: {
        label: string;
        rowKind: "item" | "total" | "group";
        values: string[];
    }[];
}[];
export declare function publisherFinancialTables(symbol: string): Promise<{
    sourceUrl: string;
    observedAt: any;
    status: "publisher_observation";
    category: string;
    columns: string[];
    rows: {
        label: string;
        rowKind: "item" | "total" | "group";
        values: string[];
    }[];
}[]>;
