import test from 'node:test';
import assert from 'node:assert/strict';
import {chartScrubIndex} from '../src/lib/chartScrub.ts';
import {feedDisplayRows,readFeedSnapshot,saveFeedSnapshot,clearFeedSnapshot} from '../src/lib/feedSnapshot.ts';
test('plot scrubbing uses full horizontal surface and clamps at both edges',()=>{
 assert.equal(chartScrubIndex(50,100,300,11,48,42),0);
 assert.equal(chartScrubIndex(253,100,300,11,48,42),5);
 assert.equal(chartScrubIndex(800,100,300,11,48,42),10);
 assert.equal(chartScrubIndex(200,100,300,0),-1);
});
test('feed snapshots isolate accounts, expire, and never retain extra credential fields',()=>{
 const storage=new Map<string,string>();
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
 const rows=[{id:'post-1',user_id:'writer',content:'A public research idea',access_token:'do-not-cache',password:'do-not-cache',author:{user_id:'writer',full_name:'Writer',access_token:'do-not-cache'}}] as any;
 saveFeedSnapshot('account-a',rows);
 assert.equal(readFeedSnapshot('account-a')?.[0].content,rows[0].content);
 assert.equal(readFeedSnapshot('account-b'),null);
 assert.equal(JSON.stringify([...storage.values()]).includes('do-not-cache'),false);
 const key=[...storage.keys()][0];const payload=JSON.parse(storage.get(key)!);payload.savedAt=Date.now()-300001;storage.set(key,JSON.stringify(payload));
 assert.equal(readFeedSnapshot('account-a'),null);
 clearFeedSnapshot('account-a');assert.equal(storage.size,0);
 assert.equal(feedDisplayRows(Array(50).fill(rows[0])).length,30);
});
