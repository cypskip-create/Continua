import { describe, expect, it } from "vitest";
import { analyzeNewsIssuers, articleEvidenceText } from "../src/services/research/newsRelevance.js";
const directory = [
  ["KQ", "Kenya Airways PLC"], ["KCB", "KCB Group PLC"], ["ABSA", "Absa Bank Kenya PLC"],
  ["KPLC", "Kenya Power and Lighting Company PLC"], ["SCOM", "Safaricom PLC"], ["INVALID", "Safaricom PLC"],
  ["EQTY", "Equity Group Holdings PLC"], ["JUB", "Jubilee Holdings PLC"], ["TOTL", "TotalEnergies Marketing Kenya PLC"],
] as const;
const issuers = directory.map(([symbol, companyName]) => ({securityId: symbol, symbol, companyName}));
const symbols = (title: string, body = "") => analyzeNewsIssuers(title, body, issuers).map(i => i.symbol);
describe("evidence-based company news", () => {
  it("links the reported Kenya Airways incident to KQ, not the market ticker rail", () => {
    expect(symbols("Passenger Dies on Kenya Airways Flight to Lagos", "Kenya Airways has said a passenger died on board their flight from Nairobi to Lagos on Tuesday.\nABSA KES 33.25 +0.45% KCB KES 92.00 -0.27% KPLC KES 21.85 SCOM KES 35.90")).toEqual(["KQ"]);
  });
  it("does not link unrelated recommended articles", () => {
    expect(symbols("Kenya Airways updates passenger services", "The airline has introduced a new passenger service.\nRelated stories\nAbsa Bank grows profits while Safaricom launches a new fund.")).toEqual(["KQ"]);
  });
  it("does not duplicate Safaricom legacy symbols", () => expect(symbols("M-Pesa must report cash theft to CBK")).toEqual(["SCOM"]));
  it("recognizes explicit business relationships and returns the source evidence", () => {
    const result = analyzeNewsIssuers("New mobile payments partnership announced", "Safaricom and KCB Bank have announced a partnership for mobile lending to their customers.", issuers);
    expect(result.map(i=>i.symbol)).toEqual(["KCB", "SCOM"]);
    expect(result.every(i=>i.basis==="article" && i.evidence.includes("partnership"))).toBe(true);
  });
  it("does not assign broad macro news to every bank", () => expect(symbols("CBK changes interest rates", "The regulator expects the policy to affect lending across the financial sector.")).toEqual([]));
  it("does not pretend unlisted firms are related listed stocks", () => expect(symbols("Quickmart announces listing plans", "The retail chain plans to list its shares on the exchange.")).toEqual([]));
  it("rejects generic equity/total words", () => expect(symbols("Total equity capital rises", "Total equity capital is an accounting measure of shareholder funding.")).toEqual([]));
  it("supports explicit tickers and brands", () => { expect(symbols("$KQ updates fleet")).toEqual(["KQ"]); expect(symbols("Jubilee Health wins an award")).toEqual(["JUB"]); });
  it("removes cookie/portfolio boilerplate", () => expect(articleEvidenceText("Headline", "Track your portfolio Equity Sector Investment Services 7.91 +1.67%\nThe actual company has announced a significant expansion today.")).toBe("The actual company has announced a significant expansion today."));
});
