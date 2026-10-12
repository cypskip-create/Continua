import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
test('every saved reaction has atlas artwork while shark and diamond leave the picker',()=>{
 const control=file('../src/components/social/CommunityReactionButton.tsx'),art=file('../src/components/social/ReactionIcon.tsx');
 assert.ok(!control.includes('.emoji}'));assert.ok(control.includes('<ReactionIcon'));
 const ids=[...control.matchAll(/id: "([a-z_]+)"/g)].map(m=>m[1]);assert.equal(ids.length,31);
 for(const id of ids)assert.ok(art.includes(id),`Missing artwork: ${id}`);
 assert.ok(art.includes('aria-hidden="true"'));assert.ok(control.includes('aria-label={item.label}'));
 assert.ok(art.includes('/reactions/continua-3d-atlas.png'));assert.ok(control.includes("r.id!=='shark'&&r.id!=='diamond_hands'"));
 assert.ok(!control.includes('>{item.label}</span>'));
});
test('safety controls only confirm success after persisted RPC and report failures',()=>{
 const ui=file('../src/components/social/SafetyMenuItems.tsx');
 assert.ok(ui.includes('community_submit_report'));assert.ok(ui.includes('if(error)throw error'));
 assert.ok(ui.includes("Couldn't submit your report"));assert.ok(!ui.includes("e.preventDefault()"));assert.ok(ui.includes('CommunityReportHost'));
 const card=file('../src/components/social/HubPostCard.tsx'),legacy=file('../src/components/social/XPostCard.tsx');
 assert.ok(card.includes('<SafetyMenuItems'));assert.ok(!card.includes('title: "Reported"'));assert.ok(!legacy.includes('title: "Reported"'));
});
test('block rules supplement ownership policies and reports are owner-private',()=>{
 const sql=file('../../supabase/migrations/20261012030000_community_safety.sql');
 assert.ok(sql.includes('AS RESTRICTIVE'));assert.ok(sql.includes('blocker_id=p_other AND blocked_id=auth.uid()'));
 assert.ok(sql.includes('reporter_id=auth.uid()'));assert.ok(sql.includes('ON CONFLICT DO NOTHING'));
 assert.ok(sql.includes('IF total>=30'));assert.ok(sql.includes('community_can_interact(user_id) FOR UPDATE'));
});
