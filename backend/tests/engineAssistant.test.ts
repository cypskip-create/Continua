import { it,expect,vi,afterEach } from "vitest";
const mocks=vi.hoisted(()=>({reserve:vi.fn(),finish:vi.fn()}));
vi.mock("../src/storage/repositories/engineRepository.js",()=>({engineRepository:{reserveAi:mocks.reserve,finishAi:mocks.finish}}));
vi.mock("../src/config/index.js",()=>({env:{OPENAI_API_KEY:"fixture-only",ENGINE_AI_MONTHLY_BUDGET_USD:5,ENGINE_AI_USER_DAILY_LIMIT:20,LOG_LEVEL:"silent",NODE_ENV:"test"}}));
import { askEngine,validateAssistantAnswer } from "../src/services/research/engineAssistant.js";
import {env} from "../src/config/index.js";
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
const evidence=[{id:"filing",title:"Company filing",asOf:"2026-10-07",url:null,facts:{revenueGrowth:12}}];
it("answers supported evidence without a provider key or paid API request",async()=>{
  const prior=env.OPENAI_API_KEY;env.OPENAI_API_KEY="";const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  try{const answer=await askEngine("calculated-user","Explain revenue growth",[{id:"KCB:company",title:"KCB reported results",asOf:"2026-01-01",url:null,facts:{financial:{period:2025,metrics:{revenueGrowth:12}}}}],{});expect(answer.answer).toContain("12.00%");expect(answer.sources[0]?.id).toBe("KCB:company");expect(fetch).not.toHaveBeenCalled();expect(mocks.reserve).not.toHaveBeenCalled();}finally{env.OPENAI_API_KEY=prior;}
});
it("rejects citations that cannot be resolved to supplied evidence",()=>{expect(()=>validateAssistantAnswer({answer:"Revenue grew.",citations:["invented"],limitations:[]},evidence)).toThrow("unknown source");});
it("enforces the budget before making any provider request",async()=>{mocks.reserve.mockRejectedValue(new Error("cap reached"));const fetch=vi.fn();vi.stubGlobal("fetch",fetch);await expect(askEngine("user-budget","What changed?",evidence,{})).rejects.toThrow("cap reached");expect(fetch).not.toHaveBeenCalled();});
it("uses bounded, server-only structured requests and caches only within the same user",async()=>{
  mocks.reserve.mockResolvedValue("usage-fixture");mocks.finish.mockResolvedValue(undefined);
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({answer:"Reported revenue growth is 12%.",citations:["filing"],limitations:["One filing only."]})}]}],usage:{input_tokens:100,output_tokens:30}}),{status:200})));vi.stubGlobal("fetch",fetch);
  const answer=await askEngine("user-a","Explain the filing",evidence,{});expect(answer.sources[0]?.title).toBe("Company filing");
  const payload=JSON.parse(fetch.mock.calls[0]?.[1].body);expect(payload.store).toBe(false);expect(payload.max_output_tokens).toBe(1200);expect(payload.text.format.strict).toBe(true);
  expect((await askEngine("user-a","Explain the filing",evidence,{})).cached).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);
  await askEngine("user-b","Explain the filing",evidence,{});expect(fetch).toHaveBeenCalledTimes(2);
});
it("retains reservation accounting when the provider fails",async()=>{
  mocks.reserve.mockResolvedValue("failed-fixture");mocks.finish.mockResolvedValue(undefined);vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:429})));
  await expect(askEngine("user-failed","Explain unavailable research",evidence,{})).rejects.toMatchObject({status:429});expect(mocks.finish).toHaveBeenCalledWith("failed-fixture","failed",null,null);
});
it("distinguishes exhausted project credits from a transient rate limit",async()=>{
  mocks.reserve.mockResolvedValue("credit-fixture");mocks.finish.mockResolvedValue(undefined);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:"credit_balance_exhausted"}}),{status:429})));
  await expect(askEngine("user-credit","Explain this report",evidence,{})).rejects.toMatchObject({status:503,message:expect.stringContaining("credits are exhausted")});
  expect(mocks.finish).toHaveBeenCalledWith("credit-fixture","failed",null,null);
});
