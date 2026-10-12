import test from 'node:test';
import assert from 'node:assert/strict';
import {postPreview,FEED_PREVIEW_CHARACTERS} from '../src/lib/postPreview.ts';
test('feed previews show up to 600 characters without changing full content',()=>{
 assert.equal(FEED_PREVIEW_CHARACTERS,600);
 const short='A short post';assert.deepEqual(postPreview(short),{text:short,truncated:false});
 const content='word '.repeat(250),before=content;const preview=postPreview(content);
 assert.ok(preview.truncated);assert.ok(Array.from(preview.text).length<=601);assert.equal(content,before);
 assert.equal(postPreview('A'.repeat(600)).truncated,false);
});
test('non-BMP characters are not split into invalid surrogate pairs',()=>{
 const preview=postPreview('🙂'.repeat(601));assert.equal(Array.from(preview.text).length,601);assert.ok(preview.text.endsWith('🙂…'));
});
