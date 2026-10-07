import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRateLimitRecovery } from "../src/api/rateLimitRecovery.ts";
const throttle = (retry = "1") => new Response(JSON.stringify({error:"Rate limit exceeded"}),{status:429,headers:{"content-type":"application/json","retry-after":retry}});
test("one safe GET retry respects Retry-After and returns recovered portfolio data", async()=>{
  const attempts: RequestInit[]=[]; const delays:number[]=[];
  const request = (async (_url:string,init:RequestInit)=>{attempts.push(init);return attempts.length===1?throttle():new Response('{"data":{"available":true}}');}) as typeof fetch;
  const init={method:"GET",headers:{"X-User-Token":"fixture"}};
  const response=await fetchWithRateLimitRecovery("https://example.invalid/engine/portfolio",init,request,async ms=>{delays.push(ms);});
  assert.equal(response.status,200);assert.deepEqual(delays,[1000]);assert.equal(attempts.length,2);assert.strictEqual(attempts[1],init);
});
test("persistent throttling retries only once",async()=>{
  let count=0; const response=await fetchWithRateLimitRecovery("https://example.invalid",{},(async()=>{count++;return throttle("0");}) as typeof fetch,async()=>{});
  assert.equal(response.status,429);assert.equal(count,2);
});
test("mutations, challenges, missing hints and long throttles are never replayed",async()=>{
  for(const [method,response] of [["POST",throttle()],["DELETE",throttle()],["GET",new Response("challenge",{status:429,headers:{"content-type":"text/html","cf-mitigated":"challenge"}})],["GET",new Response("{}",{status:429,headers:{"content-type":"application/json"}})],["GET",throttle("60")]] as const){
    let count=0;const result=await fetchWithRateLimitRecovery("https://example.invalid",{method},(async()=>{count++;return response;}) as typeof fetch,async()=>{throw new Error("Unexpected retry");});
    assert.strictEqual(result,response);assert.equal(count,1);
  }
});
test("cancelling a delayed read prevents replay",async()=>{
  const controller=new AbortController();let count=0;
  const pending=fetchWithRateLimitRecovery("https://example.invalid",{signal:controller.signal},(async()=>{count++;return throttle("5");}) as typeof fetch);
  await new Promise(resolve=>setTimeout(resolve,10));controller.abort(new Error("Cancelled"));
  await assert.rejects(pending,/Cancelled/);assert.equal(count,1);
});
