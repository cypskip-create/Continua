import type { Evidence } from "./engineAssistant.js";
/** A deterministic evidence reader, not an LLM or an investment recommendation. */
export declare function calculatedAnswer(question: string, evidence: Evidence[]): {
    answer: string;
    citations: string[];
    limitations: string[];
};
