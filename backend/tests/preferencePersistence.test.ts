import {expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({query:vi.fn(),client:{query:vi.fn()}}));
vi.mock('../src/storage/db.js',()=>({query:db.query,withTransaction:(fn:any)=>fn(db.client)}));
import {engineRepository} from '../src/storage/repositories/engineRepository.js';
import {defaultPreferences} from '../src/services/research/enginePreferences.js';
it('old settings forms cannot erase learned interests and share the visit transaction lock',async()=>{
 const settings={...defaultPreferences(),learnInterests:true,interests:[{symbol:'KCB',exchange:'NSE',visits:3}]};
 db.client.query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT settings')?[{settings}]:[]}));
 const result=await engineRepository.savePreferences('owner',{...defaultPreferences(),goal:'Income'});
 expect(result.interests).toEqual(settings.interests);
 expect(db.client.query.mock.calls[0]![1]).toEqual(['engine-preferences:owner']);
 db.client.query.mockClear();await engineRepository.recordInterest('owner','KCB','NSE',true);
 expect(db.client.query.mock.calls[0]![1]).toEqual(['engine-preferences:owner']);
 expect(JSON.parse(db.client.query.mock.calls.at(-1)![1][1]).interests).toEqual([]);
});
