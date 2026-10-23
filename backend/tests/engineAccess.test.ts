
vi.mock('../src/auth/runtime.js',()=>({getIdentityRuntime:()=>({verifyAccess:async(token:string)=>{const response=await fetch('https://identity.fixture.invalid/session',{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Invalid fixture session');const user=await response.json() as {id:string;email?:string;factors?:{status:string}[]};if(user.factors?.some((factor:any)=>factor.status==='verified')){let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString());}catch{}if(claims?.aal!=='aal2'||claims?.sub!==user.id)throw Error('MFA fixture incomplete');}return {user};}})}));
import { afterEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
import { requireSubscriber, requirePremiumPlus } from "../src/api/middleware/requireSubscriber.js";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each(["free", "premium", "premium_plus"])("full Engine is restricted for %s", async plan => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"11111111-1111-4111-8111-111111111111"}))));
  mocks.query.mockResolvedValue({rows:[{subscription_plan:plan}]});
  const next=vi.fn();
  await requirePremiumPlus(req({"x-user-token":"verified","x-supabase-key":"public"}), {} as Response, next);
  if(plan === "premium_plus") expect(next).toHaveBeenCalledWith();
  else expect(next.mock.calls[0]?.[0]).toMatchObject({status:403});
});
const req = (headers: Record<string, string>) => ({ header: (key: string) => headers[key] }) as Request;
it("rejects missing sessions before querying subscription status", async () => {
  const next = vi.fn();
  await requireSubscriber(req({}), {} as Response, next);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects a forged token even if the caller claims a paid plan", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  const next = vi.fn();
  await requireSubscriber(req({ "x-user-token": "forged", "x-supabase-key": "public", "x-plan": "premium" }), {} as Response, next);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(["free", "premium", "premium_plus"])("checks the verified user's server-side %s plan", async plan => {
  const id = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 })));
  mocks.query.mockResolvedValue({ rows: [{ subscription_plan: plan }] });
  const next = vi.fn();
  await requireSubscriber(req({ "x-user-token": "verified-session", "x-supabase-key": "public" }), {} as Response, next);
  expect(mocks.query.mock.calls[0]?.[1]).toEqual([id]);
  if (plan === "free") expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  else expect(next).toHaveBeenCalledWith();
});

it.each(['aal1','aal2'])('requires verified MFA assurance for an enrolled Engine user: %s',async aal=>{
 const id='11111111-1111-4111-8111-111111111111';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({id,factors:[{status:'verified'}]})));
 mocks.query.mockResolvedValue({rows:[{subscription_plan:'premium'}]});
 const token='fixture.'+Buffer.from(JSON.stringify({sub:id,aal})).toString('base64url')+'.fixture';
 const next=vi.fn();await requireSubscriber(req({'x-user-token':token,'x-supabase-key':'public'}),{} as Response,next);
 if(aal==='aal2')expect(next).toHaveBeenCalledWith();else expect(next.mock.calls[0]?.[0]).toMatchObject({status:401});
});
