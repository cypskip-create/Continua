import {it,expect} from "vitest";
import {calculatedAnswer} from "../src/services/research/calculatedAnswer.js";
const evidence=[{id:"KCB:company",title:"KCB filing",asOf:"2026-01-01",url:null,facts:{financial:{period:2025,metrics:{revenueGrowth:12,returnOnAssets:0.02,debtToEquity:null}}}}];
it("answers only the requested reported metric with its period and citation",()=>{const a=calculatedAnswer("Compare revenue growth",evidence);expect(a.answer).toContain("12.00%");expect(a.answer).toContain("FY 2025");expect(a.answer).not.toContain("return On Assets");expect(a.citations).toEqual(["KCB:company"]);});
it("converts fractional ROA to percent and preserves missing inputs",()=>{expect(calculatedAnswer("return on assets",evidence).answer).toContain("2.00%");expect(calculatedAnswer("debt",evidence).answer).toContain("Unavailable");});
it('uses supplied diagnostics and attribution without inventing risk probabilities',()=>{
 const answer=calculatedAnswer('cash quality and portfolio risk',[{...evidence[0]!,facts:{diagnostics:{checks:[{label:'Cash supports profit',result:'unknown',reason:'Missing CFO'}]}}},{id:'portfolio',title:'Owned holdings',asOf:null,url:null,facts:{risk:{observations:80,metrics:{attribution:{contributions:[{symbol:'KCB',riskShare:.4}],historicalVaR95:2,expectedShortfall95:3}}}}}]);
 expect(answer.answer).toContain('Cash supports profit: unknown');expect(answer.answer).toContain('40.0% of measured variance');expect(answer.answer).toContain('not maximum loss');
});
