import { expect,it } from "vitest";
import { draftCbkBondReport } from "../src/ingestion/normalizers/cbkBondReport.js";
const text=`ISSUE NUMBER FXD3/2019/015 FXD1/2019/020
ISIN KE6000001328 KE5000009984
Due Dates 10-Jul-34 21-Mar-39
Market Weighted Average Rate (%) 12.8740 13.8015
Weighted Average Rate of Accepted Bids (%) 12.7338 13.6016
Price per Kshs 100 at average yield 100.6538 95.6773
Coupon Rate (%) 12.3400 12.8730
30 September 2026`;
it("keeps accepted auction yields, coupon and face-value prices distinct",()=>{
  const records=draftCbkBondReport(text,"https://www.centralbank.go.ke/results.pdf");
  expect(records).toHaveLength(2);
  expect(records[0]?.payload).toMatchObject({yield:12.7338,coupon:12.34,price:100.6538,tenor:15,maturity:"2034-07-10T00:00:00Z",yieldBasis:"accepted_auction"});
  expect(records[0]?.observedAt).toBe("2026-09-30T00:00:00Z");
});
it("rejects missing or shifted columns instead of publishing guesses",()=>{
  expect(()=>draftCbkBondReport(text.replace("12.7338 13.6016","12.7338"),"https://www.centralbank.go.ke/results.pdf")).toThrow("not aligned");
  expect(()=>draftCbkBondReport(text,"https://example.org/results.pdf")).toThrow("official CBK");
});
