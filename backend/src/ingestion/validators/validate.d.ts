import type { z } from "zod";
import type { ValidationIssue } from "./schemas.js";
export interface ValidationResult<T> {
    valid: T[];
    rejected: {
        record: unknown;
        issues: ValidationIssue[];
    }[];
}
/** Validates an array of records against a schema, splitting into valid vs.
 *  rejected instead of throwing — one bad record from a feed should never
 *  take down an entire ingestion batch. */
export declare function validateBatch<T>(schema: z.ZodType<T>, records: unknown[]): ValidationResult<T>;
export declare function validateOne<T>(schema: z.ZodType<T>, record: unknown): {
    data: T;
} | {
    issues: ValidationIssue[];
};
