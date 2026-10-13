interface Signal {
    type: string;
    latest: number | {
        histogram: number | null;
    } | null;
    timestamps: string[];
}
export declare function buildResearchSynthesis(price: number | null, signals: Signal[], risks: string[], unavailable: string[]): {
    observations: {
        topic: string;
        text: string;
        asOf: string | null;
    }[];
    checklist: {
        topic: string;
        text: string;
        asOf: null;
    }[];
    methodology: string;
};
export {};
