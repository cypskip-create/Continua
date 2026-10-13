export interface RenderResult {
    html: string;
    finalUrl: string;
    status: number | null;
    coverage?: {
        tab: string;
        category: string | null;
        rows: number;
        expandedRows: number;
        scrollLimitReached: boolean;
    };
}
/**
 * Navigates to `url`, waits for network activity to settle (a reasonable
 * proxy for "the SPA has finished its initial data fetch" — not a
 * guarantee for sites with polling/websockets that never go idle), and
 * returns the resulting DOM as HTML.
 */
export declare function renderPage(url: string, userAgent: string, options?: {
    files?: boolean;
    stockTab?: string;
    category?: string;
    historyStart?: string;
}): Promise<RenderResult>;
export declare function closeBrowser(): Promise<void>;
