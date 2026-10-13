/** Cold-start enrichment must not occupy the entire shared API database pool.
 * Keep every task, preserve ordering and continue after independent failures.
 */
export declare function serialBootstrap(tasks: Array<{
    name: string;
    run: () => Promise<unknown>;
}>, onFailure: (name: string, error: unknown) => void): Promise<void>;
