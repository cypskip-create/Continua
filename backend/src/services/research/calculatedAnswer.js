/** A deterministic evidence reader, not an LLM or an investment recommendation. */
export function calculatedAnswer(question, evidence) {
    const q = question.toLowerCase();
    const topics = { revenueGrowth: ["revenue", "growth"], earningsGrowth: ["earnings", "profit", "growth"], cashConversion: ["cash", "quality"], debtToEquity: ["debt", "leverage", "risk"], returnOnAssets: ["return on assets", "roa"], currentRatio: ["liquidity", "current ratio"] };
    const selected = Object.keys(topics).filter(key => topics[key].some(word => q.includes(word)));
    const blocks = [], citations = [];
    const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
    const strings = (v) => Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 6) : [];
    for (const e of evidence) {
        const f = obj(e.facts), lines = [];
        if (e.id.endsWith(":company")) {
            const financial = obj(f.financial), metrics = obj(financial.metrics), briefing = obj(f.briefing);
            for (const key of selected.length ? selected : Object.keys(topics)) {
                const n = metrics[key];
                lines.push(`${key.replace(/([A-Z])/g, " $1")}: ${typeof n === "number" && Number.isFinite(n) ? (key === "returnOnAssets" ? n * 100 : n).toFixed(2) + (/Growth/.test(key) || key === "returnOnAssets" ? "%" : " ×") : "Unavailable"} (FY ${financial.period ?? "unknown"}).`);
            }
            if (/risk|change|quality/.test(q))
                lines.push(...strings(briefing.risks), ...strings(financial.findings), ...strings(obj(f.quality).warnings));
            if (/quality|cash|evidence|check/.test(q)) {
                const d = obj(f.diagnostics);
                if (Array.isArray(d.checks))
                    for (const check of d.checks.slice(0, 6)) {
                        const c = obj(check);
                        lines.push(`${c.label}: ${c.result === 'pass' ? 'met' : c.result === 'flag' ? 'review' : 'unknown'}. ${c.reason ?? ''}`);
                    }
            }
            if (/scenario/.test(q) && Array.isArray(f.scenarios))
                for (const s of f.scenarios.slice(0, 3)) {
                    const v = obj(s);
                    lines.push(`${v.name}: illustrative growth ${v.growthPercent}%; revenue ${v.revenue ?? "unavailable"}; net income ${v.netIncome ?? "unavailable"}. ${v.assumption ?? ""}`);
                }
            if (/missing|coverage/.test(q))
                lines.push(...strings(f.missing));
        }
        else if (e.id === "portfolio") {
            if (Array.isArray(f.positions))
                for (const p of [...f.positions].sort((a, b) => Number(obj(b).weight) - Number(obj(a).weight)).slice(0, 5)) {
                    const v = obj(p);
                    lines.push(`${v.symbol}: ${typeof v.weight === "number" ? (v.weight * 100).toFixed(1) + "%" : "unavailable"} portfolio weight; valued ${v.asOf ?? "date unavailable"}.`);
                }
            lines.push(...strings(f.warnings));
            if (typeof f.coverage === "string")
                lines.push(`Coverage: ${f.coverage}.`);
            if (/risk|volatil|loss|drawdown/.test(q)) {
                const risk = obj(f.risk), metrics = obj(risk.metrics), a = obj(metrics.attribution);
                lines.push(`Risk coverage: ${risk.observations ?? 0} aligned observations. ${risk.reason ?? ''}`);
                if (Array.isArray(a.contributions))
                    for (const contribution of a.contributions.slice(0, 10)) {
                        const c = obj(contribution);
                        if (typeof c.riskShare === 'number')
                            lines.push(`${c.symbol}: ${(c.riskShare * 100).toFixed(1)}% of measured variance, not capital or guaranteed future risk.`);
                    }
                lines.push(`Historical 1-day VaR (95%): ${a.historicalVaR95 ?? 'unavailable'}%; expected shortfall (95%): ${a.expectedShortfall95 ?? 'unavailable'}%. Both are backward-looking, not maximum loss.`);
            }
            if (/return|performance/.test(q)) {
                const p = obj(f.performance);
                lines.push(`Recorded time-weighted return: ${p.twr ?? "unavailable"}%; money-weighted return: ${p.moneyWeighted ?? "unavailable"}%. ${p.reason ?? ""}`);
            }
        }
        else if (e.id.includes(":news:") && /news|change|risk/.test(q)) {
            if (typeof f.summary === "string")
                lines.push(f.summary.slice(0, 1000));
        }
        else if (e.id.endsWith(":technical") && /technical|trend|momentum|price/.test(q)) {
            if (Array.isArray(f.observations))
                for (const item of f.observations.slice(0, 6)) {
                    const v = obj(item);
                    if (typeof v.text === "string")
                        lines.push(`${v.topic}: ${v.text}`);
                }
        }
        if (lines.length) {
            blocks.push(`${e.title} · ${e.asOf ?? "date unavailable"}\n${lines.map(l => "• " + l).join("\n")}`);
            citations.push(e.id);
        }
    }
    if (!citations.length) {
        citations.push(evidence[0].id);
        blocks.push("The selected evidence does not cover this question. Try revenue growth, earnings quality, debt, portfolio concentration, news or technical observations.");
    }
    return { answer: ("Calculated evidence briefing — no generative AI used.\n\n" + blocks.join("\n\n")).slice(0, 12000), citations, limitations: ["This mode reads reported fields and cannot answer arbitrary questions, infer causation or predict returns.", "Compare reporting dates and missing coverage; this is research, not a personal trade instruction."] };
}
