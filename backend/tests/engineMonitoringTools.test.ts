import {it,expect} from "vitest";
import {evaluateMonitor} from "../src/services/research/engineMonitoring.js";
const inputs={price:10,debt:2,growth:4,earningsGrowth:-5,cashConversion:0.6,dividendPayout:1.3,quoteAge:9,fingerprint:"x",material:false,quoteFresh:true};
it.each([['earnings_growth_below',0],['cash_conversion_below',1],['dividend_payout_above',1],['quote_age_above',7]])("checks %s and notifies once per crossing",(kind,threshold)=>{const first=evaluateMonitor({kind,threshold,last_state:null},inputs);expect(first.notify).toBe(true);expect(evaluateMonitor({kind,threshold,last_state:first},inputs).notify).toBe(false);});
it("preserves crossing state without alerting when an input is missing",()=>{expect(evaluateMonitor({kind:"cash_conversion_below",threshold:1,last_state:{triggered:true}},{...inputs,cashConversion:null})).toMatchObject({unavailable:true,notify:false,triggered:true,value:null});});
