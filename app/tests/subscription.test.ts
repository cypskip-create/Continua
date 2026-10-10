import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, hasResearchAccess, hasFullEngineAccess } from '../src/lib/subscription.ts';
test('Plus annual billing discounts each monthly equivalent by 17%',()=>{
  assert.equal(PLANS.premium_plus.monthly,1000);
  assert.equal(PLANS.premium_plus.annual,9960);
  assert.equal(PLANS.premium_plus.annual/12,830);
});
test('Premium retains research but only Plus gets full Engine',()=>{
  assert.equal(hasResearchAccess('premium'),true);
  assert.equal(hasFullEngineAccess('premium'),false);
  assert.equal(hasFullEngineAccess('premium_plus'),true);
  assert.equal(hasResearchAccess('free'),false);
});
