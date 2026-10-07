import {it,expect} from "vitest";
import {calculatedAnswer} from "../src/services/research/calculatedAnswer.js";
const evidence=[{id:"KCB:company",title:"KCB filing",asOf:"2026-01-01",url:null,facts:{financial:{period:2025,metrics:{revenueGrowth:12,returnOnAssets:0.02,debtToEquity:null}}}}];
it("answers only the requested reported metric with its period and citation",()=>{const a=calculatedAnswer("Compare revenue growth",evidence);expect(a.answer).toContain("12.00%");expect(a.answer).toContain("FY 2025");expect(a.answer).not.toContain("return On Assets");expect(a.citations).toEqual(["KCB:company"]);});
it("converts fractional ROA to percent and preserves missing inputs",()=>{expect(calculatedAnswer("return on assets",evidence).answer).toContain("2.00%");expect(calculatedAnswer("debt",evidence).answer).toContain("Unavailable");});
