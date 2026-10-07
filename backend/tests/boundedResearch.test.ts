import { expect, it, vi } from "vitest";
import { boundedResearch } from "../src/services/research/boundedResearch.js";
it("preserves healthy company research when another feed rejects", async()=>{
  expect(await boundedResearch([1,2,3],async n=>{if(n===2)throw new Error("offline");return n*10;})).toEqual([10,null,30]);
});
it("shares one deadline across holdings and does not launch queued work after timeout", async()=>{
  vi.useFakeTimers();
  try {
    const load=vi.fn((n:number)=>n===1?Promise.resolve(10):new Promise<number>(()=>{}));
    const result=boundedResearch([1,2,3,4,5],load,100,2);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toEqual([10,null,null,null,null]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});
