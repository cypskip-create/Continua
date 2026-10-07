import {it,expect,vi,afterEach} from "vitest";
import {getEngineBundle} from "../src/services/research/engineBundle.js";
import {securitiesRepository} from "../src/storage/repositories/securitiesRepository.js";
afterEach(()=>vi.restoreAllMocks());
it("shares a simultaneous company request and releases failures for a fresh retry",async()=>{
  let reject!:(error:Error)=>void;
  const profile=vi.spyOn(securitiesRepository,"getCompanyProfile").mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
  const a=getEngineBundle("RETRYTEST","NSE"),b=getEngineBundle("RETRYTEST","NSE");
  const result=Promise.allSettled([a,b]);await new Promise(r=>setTimeout(r,0));
  expect(profile).toHaveBeenCalledTimes(1);reject(new Error("temporary database failure"));
  expect((await result).every(r=>r.status==="rejected")).toBe(true);
  profile.mockResolvedValue(null);await expect(getEngineBundle("RETRYTEST","NSE")).rejects.toMatchObject({status:404});
  expect(profile).toHaveBeenCalledTimes(2);
});
