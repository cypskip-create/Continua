/** One memory-heavy job at a time; failure must not poison later jobs. */
export function createSerialWorkQueue() {
  let tail:Promise<unknown>=Promise.resolve();
  return function enqueue<T>(work:()=>Promise<T>):Promise<T> {
    const result=tail.then(work);
    tail=result.catch(()=>undefined);
    return result;
  };
}
