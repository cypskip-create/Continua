/** Preserve real table columns/period headers; never guess units or fiscal years. */
export declare function extractHtmlFinancialTables(html: string): {
    title: string | null;
    headerLine: string | null;
    rows: {
        label: string;
        values: string[];
    }[];
    method: string;
    confidence: number;
}[];
