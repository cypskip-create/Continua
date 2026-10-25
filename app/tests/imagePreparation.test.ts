import test from 'node:test';import assert from 'node:assert/strict';
import {prepareImage,rasterType} from '../src/lib/imagePreparation.js';
const jpeg=new Uint8Array([255,216,255,224,0,16]);
test('photo preparation detects raster bytes rather than trusting missing or misleading MIME labels',async()=>{
 const file=new Blob([jpeg],{type:'application/octet-stream'}),prepared=await prepareImage(file);assert.equal(await rasterType(file),'image/jpeg');assert.equal(prepared.type,'image/jpeg');
 await assert.rejects(()=>prepareImage(new Blob(['<svg><script/></svg>'],{type:'image/png'})),/Choose a JPEG/);
 const gif=new Blob(['GIF89a','fixture'],{type:'application/octet-stream'});assert.equal((await prepareImage(gif,{kind:'avatars'})).type,'image/gif');
});
test('large camera photos are resized and avatar crops are bounded before upload',async t=>{
 const originalBitmap=globalThis.createImageBitmap,originalDocument=globalThis.document;let closed=false,draw:any[]=[];const canvas:any={width:0,height:0,getContext:()=>({drawImage:(...args:any[])=>{draw=args;}}),toBlob:(done:any)=>done(new Blob(['RIFFxxxxWEBP'],{type:'image/webp'}))};
 Object.assign(globalThis,{createImageBitmap:async()=>({width:4000,height:3000,close(){closed=true;}}),document:{createElement:()=>canvas}});
 t.after(()=>{Object.assign(globalThis,{createImageBitmap:originalBitmap,document:originalDocument});});
 const file=new Blob([jpeg,new Uint8Array(300000)],{type:'image/jpeg'}),prepared=await prepareImage(file,{kind:'avatars'});
 assert.equal(prepared.type,'image/webp');assert.equal(canvas.width,1024);assert.equal(canvas.height,1024);assert.equal(draw[1],500);assert.equal(draw[2],0);assert.equal(draw[3],3000);assert.equal(closed,true);
});
test('oversize and empty photos fail before decode or network access',async()=>{
 class Oversize extends Blob{get size(){return 20*1024*1024+1;}}
 await assert.rejects(()=>prepareImage(new Oversize()),/20 MB/);await assert.rejects(()=>prepareImage(new Blob()),/20 MB/);
});
