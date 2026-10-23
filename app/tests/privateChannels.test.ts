import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateChannels} from '../src/integrations/continua/privateChannels.js';
const owner='91f4a30f-d8ca-45c1-a941-829838dc5fd0',room='41f4a30f-d8ca-45c1-a941-829838dc5fd0';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const sockets:any[]=[],timers:any[]=[];let authListener:any;
 class Socket {url:string;readyState=0;bufferedAmount=0;frames:any[]=[];onopen:any;onmessage:any;onclose:any;onerror:any;constructor(url:string){this.url=url;sockets.push(this);}send(value:string){this.frames.push(JSON.parse(value));}close(){this.readyState=3;this.onclose?.();}open(){this.readyState=1;this.onopen?.();}message(value:any){this.onmessage?.({data:JSON.stringify(value)});}}
 const identity={getSession:async()=>({data:{session:{user:{id:owner},access_token:'short-fixture-jwt'}},error:null}),onAuthStateChange:(listener:any)=>{authListener=listener;return {data:{subscription:{unsubscribe(){authListener=null;}}}};}};
 const client=createPrivateChannels({origin:'https://continua.invalid',identity,WebSocketImpl:Socket,schedule:(fn:any,ms:number)=>{const timer={fn,ms,cancelled:false};timers.push(timer);return timer;},cancel:(timer:any)=>{if(timer)timer.cancelled=true;}});
 return {client,sockets,timers,identity,auth:(event:string,session:any)=>authListener?.(event,session)};
}
test('private channels authenticate in frames, share a socket and replay owned snapshots',async()=>{
 const f=fixture(),notifications:any[]=[],messages:any[]=[];
 try{
  f.client.channel('inbox').on('postgres_changes',{schema:'public',table:'notifications',event:'*',filter:'user_id=eq.'+owner},value=>notifications.push(value)).subscribe();
  f.client.channel('room').on('snapshot',{table:'room_messages',filter:'room_id=eq.'+room},value=>messages.push(value)).subscribe();
  await flush();assert.equal(f.sockets.length,1);const socket=f.sockets[0];assert.equal(socket.url,'wss://continua.invalid/api/v1/events');socket.open();await flush();
  assert.deepEqual(socket.frames,[{action:'authenticate_user',token:'short-fixture-jwt'}]);socket.message({type:'authenticated_user'});assert.equal(socket.frames.filter(frame=>frame.action==='subscribe_private').length,2);
  socket.message({type:'private_snapshot',table:'notifications',filterId:owner,rows:[]});assert.equal(notifications.length,1);
  socket.message({type:'private_snapshot',table:'room_messages',filterId:room,rows:[{id:'message',room_id:room}]});assert.equal(messages[0].rows[0].id,'message');
 }finally{f.client.destroy();}
});
test('reconnection resubscribes and cancellation stops all reconnect work',async()=>{
 const f=fixture(),received:any[]=[];
 const channel=f.client.channel('room').on('snapshot',{table:'room_messages',filter:'room_id=eq.'+room},value=>received.push(value)).subscribe();
 await flush();f.sockets[0].open();await flush();f.sockets[0].message({type:'authenticated_user'});f.sockets[0].close();
 const retry=f.timers.find(timer=>timer.ms===1000&&!timer.cancelled);assert.ok(retry);retry.fn();await flush();assert.equal(f.sockets.length,2);
 const socket=f.sockets[1];socket.open();await flush();socket.message({type:'authenticated_user'});assert.ok(socket.frames.some(frame=>frame.action==='subscribe_private'));
 await f.client.removeChannel(channel);assert.equal(socket.readyState,3);socket.message({type:'private_snapshot',table:'room_messages',filterId:room,rows:[]});assert.equal(received.length,0);assert.ok(f.timers.filter(timer=>timer.ms>=1000).every(timer=>timer.cancelled));f.client.destroy();
});
test('late session restoration cannot retain an old subscription',async()=>{
 const f=fixture();let resolve:any;f.identity.getSession=()=>new Promise(done=>{resolve=done;});
 const channel=f.client.channel('inbox').on('postgres_changes',{schema:'public',event:'*',table:'notifications',filter:'user_id=eq.'+owner},()=>assert.fail('No private event expected')).subscribe();
 await f.client.removeChannel(channel);resolve({data:{session:{user:{id:owner},access_token:'late-jwt'}},error:null});await flush();assert.equal(f.sockets.length,0);f.client.destroy();
});
test('switching accounts immediately closes the old private subscription',async()=>{
 const f=fixture(),received:any[]=[];
 f.client.channel('inbox').on('postgres_changes',{schema:'public',event:'*',table:'notifications',filter:'user_id=eq.'+owner},value=>received.push(value)).subscribe();
 await flush();const socket=f.sockets[0];socket.open();await flush();socket.message({type:'authenticated_user'});
 f.auth('SIGNED_IN',{user:{id:room}});assert.equal(socket.readyState,3);
 socket.message({type:'private_snapshot',table:'notifications',filterId:owner,rows:[]});assert.equal(received.length,0);f.client.destroy();
});
test('a second consumer receives the already-authorized shared snapshot',async()=>{
 const f=fixture(),later:any[]=[];
 f.client.channel('first-room').on('snapshot',{table:'room_messages',filter:'room_id=eq.'+room},()=>{}).subscribe();
 await flush();const socket=f.sockets[0];socket.open();await flush();socket.message({type:'authenticated_user'});
 socket.message({type:'private_snapshot',table:'room_messages',filterId:room,rows:[{id:'existing',room_id:room}]});
 f.client.channel('second-room').on('snapshot',{table:'room_messages',filter:'room_id=eq.'+room},value=>later.push(value)).subscribe();
 await flush();assert.equal(later[0].rows[0].id,'existing');assert.equal(f.sockets.length,1);f.client.destroy();
});
test('a misbound notification snapshot closes the socket without delivering data',async()=>{
 const f=fixture(),received:any[]=[];
 f.client.channel('inbox').on('postgres_changes',{schema:'public',table:'notifications',event:'*',filter:'user_id=eq.'+owner},value=>received.push(value)).subscribe();
 await flush();const socket=f.sockets[0];socket.open();await flush();socket.message({type:'authenticated_user'});
 socket.message({type:'private_snapshot',table:'notifications',filterId:owner,rows:[{id:'unexpected',user_id:room}]});
 assert.equal(received.length,0);assert.equal(socket.readyState,3);f.client.destroy();
});
test('unknown tables, malformed filters and unsupported events are rejected',()=>{
 const f=fixture();try{for(const options of [{table:'profiles',filter:'user_id=eq.'+owner,event:'*'},{table:'notifications',filter:'user_id=eq.attacker',event:'*'},{table:'notifications',filter:'user_id=eq.'+owner,event:'DELETE'}])assert.throws(()=>f.client.channel('invalid').on('postgres_changes',options,()=>{}));}finally{f.client.destroy();}
});
