import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifiedNewsItem } from '../src/lib/news.ts';
test('cached stories survive but legacy stock tags do not',()=>{
  const item={id:'legacy',headline:'Passenger Dies on Kenya Airways Flight to Lagos',symbols:['KCB','SCOM'],securityIds:['bank','telco']} as any;
  const result=verifiedNewsItem(item);
  assert.equal(result.id,'legacy');assert.equal(result.headline,item.headline);
  assert.deepEqual(result.symbols,[]);assert.deepEqual(result.securityIds,[]);
  assert.deepEqual(item.symbols,['KCB','SCOM']);
});
test('only evidence-backed issuer tags are retained',()=>{
  const result=verifiedNewsItem({symbols:['KQ','KCB','KQ'],securityIds:['kq'],relevance:{version:2,evidence:[{symbol:'KQ',evidence:'Kenya Airways said a passenger died on the flight.'}]}} as any);
  assert.deepEqual(result.symbols,['KQ']);
});
