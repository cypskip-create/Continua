import { test } from "node:test";
import assert from "node:assert/strict";
import { reportBridge, ownershipSnapshot, concentration, multipleSensitivity } from "../src/lib/engineResearch.ts";
import type { FinancialHistoryEntry, OwnershipRecord } from "../src/api/types.ts";
const filing = (year: number, extra: Partial<FinancialHistoryEntry> = {}): FinancialHistoryEntry => ({ fiscalYear: year, currency: "KES", revenue: 100, netIncome: 10, eps: 1, operatingCashFlow: 20, ...extra });
test("report bridge matches exact fiscal year, quarter and known currency", () => {
    const rows = reportBridge([filing(2023), filing(2025, { revenue: 150 }), filing(2026, { revenue: 180 })]);
    assert.equal(rows[1].revenueGrowth, null);
    assert.equal(rows[2].revenueGrowth, 20);
    assert.equal(rows[2].margin, 10 / 180 * 100);
    assert.equal(rows[2].cashConversion, 2);
    assert.equal(reportBridge([filing(2025, { currency: "USD" }), filing(2026)])[1].revenueGrowth, null);
    assert.equal(reportBridge([filing(2025, { currency: undefined }), filing(2026, { currency: undefined })])[1].revenueGrowth, null);
    assert.equal(reportBridge([filing(2025, { fiscalQuarter: 1 }), filing(2026, { fiscalQuarter: 2 })])[1].revenueGrowth, null);
});
test("losses and missing cash do not become cash conversion", () => {
    assert.equal(reportBridge([filing(2025, { netIncome: -10 })])[0].cashConversion, null);
    const r = reportBridge([filing(2025, { operatingCashFlow: null })])[0];
    assert.equal(r.cashConversion, null);
    assert.equal(r.cashProfitGap, null);
});
test("ownership audit does not combine disclosure dates or invent a zero", () => {
    const holder = (asOf: string, p: number): OwnershipRecord => ({ securityId: "x", holderName: "Holder", holderType: "institution", sharesHeld: 100, percentHeld: p, asOf });
    const result = ownershipSnapshot([holder("2025-01-01", 20), holder("2026-01-01", 25)], "2026-01-01");
    assert.equal(result.disclosedPercent, 25);
    assert.equal(result.rows.length, 1);
    assert.equal(ownershipSnapshot([], "2026").disclosedPercent, null);
    assert.equal(ownershipSnapshot([holder("2026", NaN)], "2026").invalid, 1);
});
test("concentration uses covered weights and handles no coverage", () => {
    assert.equal(concentration([1]).effectiveHoldings, 1);
    assert.equal(concentration([.25, .25, .25, .25]).effectiveHoldings, 4);
    assert.equal(concentration([.25, .25, .25, .25]).topThree, 75);
    assert.equal(concentration([NaN, 0, -1]).topThree, null);
});
test("EPS stress is bounded and nonpositive EPS cannot yield a P/E value", () => {
    assert.equal(multipleSensitivity(5, -20, 10), 40);
    assert.equal(multipleSensitivity(-1, 0, 10), null);
    assert.equal(multipleSensitivity(null, 0, 10), null);
    assert.equal(multipleSensitivity(5, -101, 10), null);
});
