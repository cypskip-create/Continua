import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCacheTime, formatIndexChange, isPublishedQuery } from '../src/lib/researchCache.ts';
test('published cache excludes account access and private workspaces', () => {
  for (const kind of ['research','financials-history','indices','candles','quotes','observed-price-history-v2','valuation-rating-v3']) assert.equal(isPublishedQuery(['continua',kind,'ABSA']),true);
  for (const kind of ['profile','research-access','engine','engine-portfolio','journal','notifications','billing','portfolio','watchlist']) assert.equal(isPublishedQuery(['continua',kind]),false);
});
test('cache expiry and timestamps cannot pretend stale data is new',()=>{
  assert.equal(freshCacheTime(100,200,101),true);
  for(const value of [0,300,'100',NaN]) assert.equal(freshCacheTime(value,200,101),false);
  assert.equal(freshCacheTime(100,201,101),false);
});
test('index changes always have two decimals, without negative zero',()=>{
  assert.equal(formatIndexChange(-0.1673488),'-0.17%');
  assert.equal(formatIndexChange(1),'+1.00%');
  assert.equal(formatIndexChange(-0.0001),'+0.00%');
  assert.equal(formatIndexChange(null),'—');
});
