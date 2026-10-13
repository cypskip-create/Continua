export interface Evidence {
    id: string;
    title: string;
    asOf: string | null;
    url: string | null;
    facts: unknown;
}
export declare function validateAssistantAnswer(value: unknown, evidence: Evidence[]): {
    sources: Evidence[];
    answer: string;
    citations: string[];
    limitations: string[];
};
export declare function askEngine(userId: string, question: string, evidence: Evidence[], preferences: unknown): Promise<{
    sources: Evidence[];
    answer: string;
    citations: string[];
    limitations: string[];
} & {
    cached: boolean;
}>;
