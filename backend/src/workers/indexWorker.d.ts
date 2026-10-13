export interface RunOnceOptions {
    respectTradingCalendar?: boolean;
}
export declare function runIndexIngestionOnce(options?: RunOnceOptions): Promise<void>;
export declare function startIndexWorker(): () => void;
