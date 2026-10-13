/** One memory-heavy job at a time; failure must not poison later jobs. */
export function createSerialWorkQueue() {
    let tail = Promise.resolve();
    return function enqueue(work) {
        const result = tail.then(work);
        tail = result.catch(() => undefined);
        return result;
    };
}
