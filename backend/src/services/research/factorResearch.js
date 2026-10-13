const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
function solve(a, b) {
    const m = a.map((r, i) => [...r, b[i]]), n = b.length;
    for (let k = 0; k < n; k++) {
        let pivot = k;
        for (let i = k + 1; i < n; i++)
            if (Math.abs(m[i][k]) > Math.abs(m[pivot][k]))
                pivot = i;
        [m[k], m[pivot]] = [m[pivot], m[k]];
        if (Math.abs(m[k][k]) < 1e-12)
            throw new Error("Factor matrix is singular or ill-conditioned. Remove duplicate/constant factors.");
        const v = m[k][k];
        for (let j = k; j <= n; j++)
            m[k][j] /= v;
        for (let i = 0; i < n; i++)
            if (i !== k) {
                const f = m[i][k];
                for (let j = k; j <= n; j++)
                    m[i][j] -= f * m[k][j];
            }
    }
    return m.map((r) => r[n]);
}
export function factorResearch(points) {
    const names = Object.keys(points[0]?.factors ?? {}).sort();
    if (points.length < 180 ||
        names.length < 1 ||
        names.length > 3 ||
        points.some((p) => Object.keys(p.factors).sort().join("|") !== names.join("|")))
        throw new Error("180 aligned observations with the same one to three factor names are required.");
    const split = Math.floor((points.length * 2) / 3), train = points.slice(0, split), test = points.slice(split), n = names.length + 1;
    const vector = (p) => [1, ...names.map((k) => p.factors[k])];
    const a = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
    for (const p of train) {
        const x = vector(p);
        for (let i = 0; i < n; i++) {
            b[i] += x[i] * p.portfolioReturn;
            for (let j = 0; j < n; j++)
                a[i][j] += x[i] * x[j];
        }
    }
    const beta = solve(a, b), predict = (p) => vector(p).reduce((s, x, i) => s + x * beta[i], 0);
    const r2 = (rows) => {
        const m = mean(rows.map((p) => p.portfolioReturn)), sst = rows.reduce((s, p) => s + (p.portfolioReturn - m) ** 2, 0), sse = rows.reduce((s, p) => s + (p.portfolioReturn - predict(p)) ** 2, 0);
        return sst > 1e-18 ? 1 - sse / sst : null;
    };
    const sorted = train.map((p) => p.portfolioReturn).sort((a, b) => a - b), tailCount = Math.ceil(train.length * 0.05), threshold = sorted[tailCount - 1];
    const breaches = test.filter((p) => p.portfolioReturn < threshold).length;
    return {
        intercept: beta[0],
        exposures: names.map((factor, i) => ({ factor, beta: beta[i + 1] })),
        trainingObservations: train.length,
        holdoutObservations: test.length,
        trainingR2: r2(train),
        holdoutR2: r2(test),
        holdoutRmsePercent: Math.sqrt(mean(test.map((p) => (p.portfolioReturn - predict(p)) ** 2))) *
            100,
        historicalVaR95Percent: Math.max(0, -threshold) * 100,
        expectedShortfall95Percent: Math.max(0, -mean(sorted.slice(0, tailCount))) * 100,
        holdoutBreachCount: breaches,
        holdoutBreachRatePercent: (breaches / test.length) * 100,
        curve: points.map((p) => ({
            date: p.date,
            index: p.portfolioReturn * 100,
            benchmark: predict(p) * 100,
        })),
        methodology: "OLS exposures trained only on the first two-thirds of observations; the final third is an untouched temporal holdout. VaR/ES are empirical training-sample portfolio-return tails, not factor-predicted losses. Breaches compare holdout returns with the fixed training 5% threshold. Negative holdout R² is possible. These diagnostics do not certify calibration, causality, suitability or future performance.",
    };
}
