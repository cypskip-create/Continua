/** One memory-heavy job at a time; failure must not poison later jobs. */
export declare function createSerialWorkQueue(): <T>(work: () => Promise<T>) => Promise<T>;
