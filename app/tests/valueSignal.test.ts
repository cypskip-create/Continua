import test from "node:test";
import assert from "node:assert/strict";
import { valueSignal, modelPricePath } from "../src/lib/valueSignal.ts";
const valuation=(values:number[],price=50)=>({symbol:"KCB",exchange:"NSE",currency:"KES",currentPrice:price,caveat:"Test",models:values.map((fairValue,i)=>({model:`Model ${i}`,fairValue,currentPrice:price,upsidePercent:null,inputs:{},methodology:"Test only"}))});
test("rating uses the median, rejects nonpositive models and shared-price mismatches",()=>{
  const v=valuation([60,62,1000,0,-10]);v.models.push({...v.models[0],model:"Old quote",currentPrice:10});
  const s=valueSignal(v);assert.equal(s.fair,62);assert.equal(s.models.length,3);assert.equal(s.excluded,3);assert.equal(s.agreement,"Wide");assert.equal(s.stars,3);
});
test("limited and dispersed models require wider star bands; missing inputs stay unrated",()=>{
  assert.equal(valueSignal(valuation([58,60,62])).stars,4);
  assert.equal(valueSignal(valuation([60])).stars,3);
  assert.equal(valueSignal(valuation([10,60,100])).agreement,"Wide");
  assert.equal(valueSignal(undefined).stars,null);
  assert.equal(valueSignal(valuation([0,-1,NaN])).stars,null);
});
test("rating bands have explicit symmetric boundary semantics",()=>{
  const close=(fair:number)=>valueSignal(valuation([fair,fair]));
  assert.equal(close(65).stars,5);assert.equal(close(55).stars,4);
  assert.equal(close(45).stars,2);
  assert.equal(close(44.99).stars,2);assert.equal(close(35).stars,1);
});
test("price scenarios only interpolate valid values and clamp adjustable assumptions",()=>{
  assert.deepEqual(modelPricePath(null,60),[]);
  assert.equal(modelPricePath(50,60).at(-1)?.value,60);
  assert.equal(modelPricePath(50,60,24,50).at(-1)?.value,55);
  assert.equal(modelPricePath(50,60,24,0).at(-1)?.value,50);
  assert.equal(modelPricePath(50,60,100,200).at(-1)?.month,"36m");
});
