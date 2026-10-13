export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    isRetryable?: (err: unknown) => boolean;
    onRetry?: (attempt: number, err: unknown) => void;
}
export declare function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
