const round2 = (n) => Math.round(n * 100) / 100;
export function normalizeIndex(index) {
    const value = round2(index.value);
    const previousClose = round2(index.previousClose);
    const change = round2(value - previousClose);
    const changePercent = previousClose !== 0 ? round2((change / previousClose) * 100) : 0;
    return {
        ...index,
        value, previousClose, change, changePercent,
        code: index.code.trim().toUpperCase(),
    };
}
