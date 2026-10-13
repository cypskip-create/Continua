import type { SourceAdapter } from '../types.js';
export declare function afxProfileFacts(html: string): {
    kind: string;
    companyName: string;
    facts: Record<string, string>;
} | null;
export declare function afxCloseCandidates(html: string): {
    kind: string;
    date: string;
    close: number;
    volume: number | null;
    basis: string;
}[];
export declare const afxAdapter: SourceAdapter;
