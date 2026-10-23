import {afterEach,it,expect,vi} from 'vitest';import {createServer} from 'node:http';import {once} from 'node:events';import {WebSocket} from 'ws';
const mocks=vi.hoisted(()=>({verifyAccess:vi.fn(async token=>{if(token!=='owner-token')throw Error('Invalid');return {user:{id:'owner'},claims:{sub:'owner'}};}),readAuthorizedSnapshot:vi.fn(async()=>({rows:[{id:'owned-message'}],digest:'one'}))}));
vi.mock('../src/config/index.js',()=>({env:{API_KEY_AUTH_ENABLED:true,DEV_API_KEY:'fixture-only',ALLOWED_ORIGINS:['https://continua.invalid'],NODE_ENV:'test',LOG_LEVEL:'silent'}}));
vi.mock('../src/auth/runtime.js',()=>({getIdentityRuntime:()=>({verifyAccess:mocks.verifyAccess,database:{}})}));
vi.mock('../src/services/apiKeyAccess.js',()=>({findApiKey:async()=>null}));
vi.mock('../src/streaming/privateSnapshotFeed.js',async importOriginal=>({...await importOriginal(),readAuthorizedSnapshot:mocks.readAuthorizedSnapshot}));
import {startWebSocketServer} from '../src/streaming/websocketServer.js';import {marketEventBus} from '../src/streaming/pubsub.js';
let server,wss;const sockets=[];
afterEach(async()=>{for(const socket of sockets.splice(0))socket.terminate();if(wss){for(const client of wss.clients)client.terminate();await new Promise(resolve=>wss.close(resolve));}if(server)await new Promise(resolve=>server.close(resolve));server=null;wss=null;vi.clearAllMocks();});
async function connect(path='/api/v1/events',origin='https://continua.invalid'){
 if(!server){server=createServer();wss=startWebSocketServer(server);server.listen(0,'127.0.0.1');await once(server,'listening');}
 const socket=new WebSocket('ws://127.0.0.1:'+server.address().port+path,{origin});sockets.push(socket);await once(socket,'open');return socket;
}
async function message(socket,value){const next=once(socket,'message');socket.send(JSON.stringify(value));return JSON.parse((await next)[0].toString());}
it('authenticates private subscriptions without granting market API-key access',async()=>{
 const socket=await connect();expect(await message(socket,{action:'authenticate_user',token:'owner-token'})).toEqual({type:'authenticated_user'});
 const id='91f4a30f-d8ca-45c1-a941-829838dc5fd0';expect(await message(socket,{action:'subscribe_private',table:'room_messages',filterId:id})).toMatchObject({type:'private_snapshot',table:'room_messages',rows:[{id:'owned-message'}]});
 const observed=[];socket.on('message',raw=>observed.push(JSON.parse(raw.toString())));marketEventBus.publishCorporateAction({symbol:'SCOM'});
 const closed=once(socket,'close');socket.send(JSON.stringify({action:'subscribe',symbols:['SCOM']}));expect((await closed)[0]).toBe(1008);expect(observed).toEqual([]);
});
it('rejects token URLs, foreign origins, invalid JWTs and unauthenticated subscriptions',async()=>{
 for(const [path,origin,frame] of [
  ['/api/v1/events?token=forbidden','https://continua.invalid',{action:'authenticate_user',token:'owner-token'}],
  ['/api/v1/events','https://attacker.invalid',{action:'authenticate_user',token:'owner-token'}],
  ['/api/v1/events','https://continua.invalid',{action:'authenticate_user',token:'wrong'}],
  ['/api/v1/events','https://continua.invalid',{action:'subscribe_private',table:'notifications',filterId:'owner'}],
 ]){const socket=await connect(path,origin),closed=once(socket,'close');socket.send(JSON.stringify(frame));expect((await closed)[0]).toBe(1008);}
 expect(mocks.readAuthorizedSnapshot).not.toHaveBeenCalled();
});
