import {describe,it,expect,vi} from 'vitest';
import {compileDataRequest,executeDataRequest} from './browserData.js';
const build=(query,extra={})=>compileDataRequest({table:'portfolios',method:'GET',search:new URLSearchParams(query),...extra});
describe('owned data query compilation',()=>{
 it('binds all filter text instead of interpolating client values',()=>{const attack="x'); DROP TABLE public.profiles;--";const r=build({symbol:'eq.'+attack,select:'symbol,shares'});expect(r.sql).not.toContain(attack);expect(r.params[0]).toBe(attack);expect(r.sql).toContain('"symbol" = $1');});
 it('does not expose arbitrary schemas, tables, columns, SQL expressions or joins',()=>{for(const extra of [{table:'continua_auth_user'},{table:'constructor'},{table:'__proto__'},{table:'public.profiles'},{search:new URLSearchParams({select:'pg_sleep(30)'})},{search:new URLSearchParams({select:'profiles(*)'})},{search:new URLSearchParams({order:'shares.desc;drop'})}])expect(()=>build({},extra)).toThrow();});
 it('prevents writes through the public profile view',()=>{expect(()=>build({user_id:'eq.fixture'},{table:'profiles_public',method:'PATCH',body:{full_name:'changed'}})).toThrow('read-only');});
 it('bounds pagination, alternative filters and insert sizes',()=>{for(const q of [{limit:'1001'},{offset:'-1'},{limit:'NaN'},{order:'shares.asc.nullsfirst.extra'}])expect(()=>build(q)).toThrow();expect(()=>build({}, {method:'POST',body:Array.from({length:101},()=>({symbol:'TEST'}))})).toThrow();});
 it('parses list and search filters into bound values',()=>{const r=build({symbol:'in.("A,B",C)',or:'(name.ilike.%test%,symbol.eq.TEST)'});expect(r.params.slice(0,4)).toEqual(['A,B','C','%test%','TEST']);expect(r.sql).toContain(' OR ');});
 it('never permits an unfiltered update or delete',()=>{for(const method of ['PATCH','DELETE'])expect(()=>build({}, {method,body:{shares:3}})).toThrow('filter');});
 it('keeps conflict keys and values independently validated',()=>{const r=compileDataRequest({table:'watchlists',method:'POST',search:new URLSearchParams({on_conflict:'user_id,symbol'}),body:{user_id:'fixture',symbol:'TEST'},prefer:'resolution=merge-duplicates,return=representation'});expect(r.sql).toContain('ON CONFLICT ("user_id","symbol")');expect(r.params).toEqual(['fixture','TEST']);expect(()=>compileDataRequest({table:'watchlists',method:'POST',search:new URLSearchParams({on_conflict:'user_id);DROP TABLE profiles;--'}),body:{symbol:'TEST'},prefer:'resolution=merge-duplicates'})).toThrow();});
});
describe('RLS transaction boundary',()=>{
 it('counts only when requested and keeps HEAD inside RLS without reading row payloads',async()=>{
  expect(build({}).countSql).toBeUndefined();
  const counted=build({},{method:'HEAD',prefer:'count=exact'});
  expect(counted.countSql).toContain('count(*)');
  const events=[];const client={query:async sql=>{events.push(sql);return {rows:[{count:'7'}]};},release:()=>events.push('release')};
  const result=await executeDataRequest({connect:async()=>client},counted,{sub:'verified-user'});
  expect(result.count).toBe('7');expect(result.json).toBe('[]');
  expect(events).toContain('SELECT public.continua_session_guard()');
  expect(events.some(sql=>sql.includes('row_to_json'))).toBe(false);
  expect(events.slice(-2)).toEqual(['COMMIT','release']);
 });
 it('sets a server-selected local role and rolls back on permission failure before releasing',async()=>{const events=[];const client={query:vi.fn(async(sql)=>{events.push(sql);if(sql.includes('row_to_json'))throw Error('permission denied');return {rows:[{count:'0'}]};}),release:vi.fn(()=>events.push('release'))};await expect(executeDataRequest({connect:async()=>client},build({}),{sub:'verified-user'})).rejects.toThrow('permission');expect(events).toContain('SET LOCAL ROLE authenticated');expect(events).toContain('SELECT public.continua_session_guard()');expect(events.slice(-2)).toEqual(['ROLLBACK','release']);});
 it('uses the anonymous role without caller claims and preserves numeric JSON text',async()=>{const events=[];const client={query:async(sql)=>{events.push(sql);return {rows:sql.includes('row_to_json')?[{payload:'{"shares":9007199254740993.000001}'}]:[{count:'1'}]};},release:()=>events.push('release')};const r=await executeDataRequest({connect:async()=>client},build({}));expect(r.json).toBe('[{"shares":9007199254740993.000001}]');expect(events).toContain('SET LOCAL ROLE anon');expect(events).not.toContain('SELECT public.continua_session_guard()');expect(events.slice(-2)).toEqual(['COMMIT','release']);});
});
