import test from "node:test";
import assert from "node:assert/strict";
import { valueSignal, modelPricePath } from "../src/lib/valueSignal.ts";
const valuation={symbol:'KCB',exchange:'NSE',currency:'KES',currentPrice:50,caveat:'Fixture',models:[]};
test('old or missing valuation payloads never regenerate browser stars',()=>{
 assert.equal(valueSignal(valuation).stars,null);assert.equal(valueSignal(undefined).stars,null);
});
test('presentation uses the canonical Engine rating without recalculating it',()=>{
 const rating={methodologyVersion:'continua-value-rating-v3',price:50,fair:61,low:60,high:62,spread:2/61,agreement:'Close',bands:[10,30],upside:22,stars:4,models:[],excluded:0,unavailableReason:null,priceAsOf:'2026-10-18T12:00:00Z',calculatedAt:'2026-10-18T12:00:00Z',methodology:'Fixture'};
 assert.equal(valueSignal({...valuation,rating}),rating);
 assert.equal(valueSignal({...valuation,rating:{...rating,methodologyVersion:'old'}}).stars,null);
});
test("price scenarios only interpolate valid values and clamp adjustable assumptions",()=>{
  assert.deepEqual(modelPricePath(null,60),[]);
  assert.equal(modelPricePath(50,60).at(-1)?.value,60);
  assert.equal(modelPricePath(50,60,24,50).at(-1)?.value,55);
  assert.equal(modelPricePath(50,60,24,0).at(-1)?.value,50);
  assert.equal(modelPricePath(50,60,100,200).at(-1)?.month,"36m");
});
