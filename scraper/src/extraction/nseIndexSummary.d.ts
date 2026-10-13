export interface NseIndexObservation {
    kind: 'nse_index';
    code: string;
    value: number;
    change: number;
    asOf: string;
}
/** Verified against NSE's stat_col/stat_figures markup. Never read unrelated
 * ticker prices or substitute scrape time for the publisher's observation date. */
export declare function extractNseIndexSummary(html: string): NseIndexObservation[];
