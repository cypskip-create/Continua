// Readers and publishers share versions: publishing must invalidate the
// exact contract the app consumes, not a retired cache-key version.
export const engineCacheKeys = {
    bundle: (exchange, symbol) => `engine:v6:${exchange}:${symbol}`,
    lastGood: (exchange, symbol) => `engine:last-good:v3:${exchange}:${symbol}`,
};
