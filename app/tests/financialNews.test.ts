import { test } from "node:test";
import assert from "node:assert/strict";
import { isFinancialNews } from "../src/lib/financialNews.ts";
test("cached financial feeds reject unrelated incidents even with legacy ticker tags", () => {
  for (const headline of ["14 killed, 17 injured from banditry between June and September in Samburu, Meru, Isiolo", "No compensation for livestock killed during Samburu operation, Murkomen says", "Passenger Dies on Kenya Airways Flight to Lagos"]) assert.equal(isFinancialNews(headline,"Security officials addressed the operation.",true),false,headline);
  assert.equal(isFinancialNews("County leaders meet","Related stories: Bank earnings rise",true),false);
});
test("financial coverage includes macro, property, fuel and sourced company operations", () => {
  for(const headline of ["Inflation slows", "Real estate rental demand rises", "Fuel prices fall", "Kenya Airways revenue improves", "Treasury bond auction results"]) assert.equal(isFinancialNews(headline),true,headline);
  assert.equal(isFinancialNews("Safaricom launches a new service","Customers can subscribe today",true),true);
});
