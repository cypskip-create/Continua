// Readers and publishers share versions: publishing must invalidate the
// exact contract the app consumes, not a retired cache-key version.
export const engineCacheKeys={
 bundle:(exchange:string,symbol:string)=>`engine:v5:${exchange}:${symbol}`,
 lastGood:(exchange:string,symbol:string)=>`engine:last-good:v2:${exchange}:${symbol}`,
};
