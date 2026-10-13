export interface RetryOptions {
    retries?: number;
    baseDelayMs?: number;
    factor?: number;
    label?: string;
}
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
