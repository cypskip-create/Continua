import test from 'node:test';import assert from 'node:assert/strict';
import {planStorageReferences} from './storage-references.mjs';
const sha='a'.repeat(64),row={id:'9007199254740993',storage_path:'source\\2026\\file.pdf',sha256:sha,size_bytes:'123'},entry={bucket:'scraper-raw',name:'source/2026/file.pdf',verified:true,sha256:sha,bytes:123,key:`migration/supabase/scraper-raw/${sha}.pdf`};
test('reference plan binds exact path, bytes and digest without bigint conversion',()=>{
 const plan=planStorageReferences([row],[entry]);assert.equal(plan.ready,true);assert.equal(plan.updates[0].id,row.id);assert.equal(plan.updates[0].originalPath,row.storage_path);assert.equal(plan.updates[0].target,`r2://continua-financial-documents/${entry.key}`);
});
test('an absent source object remains an explicit cutover blocker',()=>{
 const plan=planStorageReferences([row],[]);assert.equal(plan.ready,false);assert.equal(plan.updates.length,0);assert.deepEqual(plan.unresolved,[{id:row.id,reason:'NO_VERIFIED_SNAPSHOT_OBJECT'}]);
});
test('a recovered original must bind its verified content to the exact artifact ID',()=>{
 const recovered={verified:true,sha256:sha,bytes:123,key:`migration/legacy-raw/${sha}.pdf`,artifactIds:[row.id]};
 assert.equal(planStorageReferences([row],[],{recovered:[recovered]}).ready,true);
 assert.equal(planStorageReferences([{...row,id:'42'}],[],{recovered:[recovered]}).ready,false);
 assert.throws(()=>planStorageReferences([row],[],{recovered:[{...recovered,bytes:122}]}));
 assert.throws(()=>planStorageReferences([row],[],{recovered:[{...recovered,key:'other/file.pdf'}]}));
});
test('mismatched evidence and invented target locations fail closed',()=>{
 for(const bad of [{...entry,sha256:'b'.repeat(64)},{...entry,bytes:122},{...entry,verified:false},{...entry,key:'other/private.pdf'}])assert.throws(()=>planStorageReferences([row],[bad]));
 assert.throws(()=>planStorageReferences([row,row],[entry]));assert.throws(()=>planStorageReferences([row],[entry,entry]));assert.throws(()=>planStorageReferences([{...row,storage_path:'../secret'}],[entry]));assert.throws(()=>planStorageReferences([row],[entry],{bucket:'public'}));
});
