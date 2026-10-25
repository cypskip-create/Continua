import {describe,it,expect,vi} from 'vitest';
import {communityFeedQuery,readCommunityFeed} from './communityFeed.js';
describe('community feed authorization and query boundary',()=>{
 it('binds the verified owner and retains every privacy relation inside one fixed query',()=>{
  const owner="owner');drop table posts;--",compiled=communityFeedQuery(owner);expect(compiled.params).toEqual([owner]);expect(compiled.sql).not.toContain(owner);
  for(const table of ['hidden_posts','blocked_users','muted_users','muted_keywords','profiles_public','post_likes','post_reposts','post_bookmarks','post_reactions','post_comments'])expect(compiled.sql).toContain('public.'+table);
  expect(compiled.sql).toContain('LIMIT 50');expect(compiled.sql).toContain('LIMIT 2');expect(compiled.sql).not.toMatch(/SECURITY DEFINER|service_role|BYPASSRLS/);
 });
 it('executes only after the live SQL guard and releases/rolls back failures',async()=>{
  const calls=[];const client={query:vi.fn(async(sql,params)=>{calls.push(sql);if(sql.includes('continua_session_guard'))throw Object.assign(Error('revoked'),{code:'42501'});return {rows:[]};}),release:vi.fn()};
  await expect(readCommunityFeed({connect:async()=>client},{sub:'owner'})).rejects.toThrow('revoked');
  expect(calls.some(sql=>sql.includes('WITH visible'))).toBe(false);expect(calls.at(-1)).toBe('ROLLBACK');expect(client.release).toHaveBeenCalledOnce();
 });
});
