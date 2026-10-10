import { afterEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../src/storage/db.js",()=>({query:mocks.query}));
vi.mock("../src/config/index.js",()=>({env:{LOG_LEVEL:"silent",NODE_ENV:"test",SUPABASE_URL:"https://auth.example.invalid",RATE_LIMIT_WINDOW_MS:60000,RATE_LIMIT_MAX_DEFAULT:2}}));
import { apiRateLimit } from "../src/api/middleware/rateLimit.js";
import { verifyEngineRateLimitIdentity, requireSubscriber } from "../src/api/middleware/requireSubscriber.js";
import { errorHandler } from "../src/api/middleware/errorHandler.js";
const realFetch=globalThis.fetch;
it('isolates public visitors sharing the website API key',async()=>{
  const app=express();app.set('trust proxy',1);
  app.use((req,_res,next)=>{req.apiKey={id:'browser',name:'website',active:true,rateLimitPerMin:2};next();});
  app.use(apiRateLimit());app.get('/research',(_req,res)=>res.json({data:[]}));
  server=await new Promise<Server>(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
  const address=server.address() as {port:number};
  const get=(ip:string)=>realFetch(`http://127.0.0.1:${address.port}/research`,{headers:{'x-forwarded-for':ip}});
  expect((await get('192.0.2.1')).status).toBe(200);
  expect((await get('192.0.2.1')).status).toBe(200);
  expect((await get('192.0.2.1')).status).toBe(429);
  expect((await get('192.0.2.2')).status).toBe(200);
});
let server:Server|undefined;
afterEach(async()=>{vi.unstubAllGlobals();vi.clearAllMocks();if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;}});
it("public traffic and other users cannot exhaust a verified user's Engine allowance",async()=>{
  const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
  const authFetch=vi.fn(async(_url:string,init:RequestInit)=>{
    const token=(init.headers as Record<string,string>).Authorization;
    return token==="Bearer a"||token==="Bearer b"?new Response(JSON.stringify({id:token.endsWith("a")?a:b})):new Response("{}",{status:401});
  });
  vi.stubGlobal("fetch",authFetch);mocks.query.mockResolvedValue({rows:[{subscription_plan:"premium"}]});
  const app=express();
  app.use((req,_res,next)=>{req.apiKey={id:"shared-browser-key",name:"browser",active:true,rateLimitPerMin:2};next();});
  app.use("/api/v1",verifyEngineRateLimitIdentity,apiRateLimit());
  app.get("/api/v1/instruments",(_req,res)=>res.json({data:[]}));
  app.get("/api/v1/engine/portfolio",requireSubscriber,(_req,res)=>res.json({data:{user:res.locals.engineUserId}}));
  app.use(errorHandler);
  server=await new Promise<Server>(resolve=>{const listening=app.listen(0,"127.0.0.1",()=>resolve(listening));});
  const address=server.address() as {port:number};
  const get=async(path:string,token?:string)=>realFetch(`http://127.0.0.1:${address.port}/api/v1${path}`,{headers:token?{"x-user-token":token,"x-supabase-key":"public","x-user-id":b}:undefined});
  expect((await get("/instruments")).status).toBe(200);
  expect((await get("/instruments")).status).toBe(200);
  expect((await get("/instruments")).status).toBe(429);
  for(const token of ["a","b"]){
    const response=await get("/engine/portfolio",token);expect(response.status).toBe(200);
    expect(((await response.json()) as {data:{user:string}}).data.user).toBe(token==="a"?a:b);
    expect((await get("/engine/portfolio",token)).status).toBe(200);
  }
  const blocked=await get("/engine/portfolio","a");expect(blocked.status).toBe(429);expect(blocked.headers.get("retry-after")).not.toBeNull();
  expect((await get("/engine/portfolio","forged")).status).toBe(401);
  expect((await get("/engine/portfolio")).status).toBe(401);
  // Once per incoming signed-in request, not again inside requireSubscriber.
  expect(mocks.query).toHaveBeenCalledTimes(5);
});
