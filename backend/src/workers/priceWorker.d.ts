export interface RunOnceOptions {
    /** Bootstrap's one-time seed pass sets this false — it needs at least one
     *  quote to exist (for research to compute against) regardless of
     *  whether the market happens to be open at deploy time. The recurring
     *  interval leaves this true. */
    respectTradingCalendar?: boolean;
}
/** One full pass over every active symbol on every registered exchange.
 *  Exported separately from the interval loop so bootstrap can run it
 *  synchronously once (to populate live_quotes before anything downstream
 *  — like a first research computation — needs a price to work with). */
export declare function runPriceIngestionOnce(options?: RunOnceOptions): Promise<void>;
export declare function startPriceWorker(): () => void;
