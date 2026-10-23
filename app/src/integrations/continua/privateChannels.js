// Audited notifications/room snapshot transport, not a general CDC SDK.
// Credentials travel only in the first/renewal frame of an owned WSS socket.
export function createPrivateChannels({origin,identity,WebSocketImpl=globalThis.WebSocket,schedule=setTimeout,cancel=clearTimeout}){
 const endpoint=new URL('/api/v1/events',origin);if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(endpoint.hostname))throw Error('Owned HTTPS socket origin required');endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
 const channels=new Set(),lastSnapshots=new Map();let socket,connecting=false,ready=false,retry,heartbeat,deadline,attempt=0,generation=0,owner=null,destroyed=false;
 const safe=(callback,...args)=>{try{Promise.resolve(callback?.(...args)).catch(()=>{});}catch{}};
 const contract=channel=>channel.spec.table+':'+channel.spec.filterId;
 const active=()=>[...channels].filter(channel=>channel.active);
 function send(value){if(!socket||socket.readyState!==1||socket.bufferedAmount>65536)throw Error('Socket unavailable');socket.send(JSON.stringify(value));}
 function disconnect(clear=false){generation++;connecting=false;ready=false;lastSnapshots.clear();cancel(retry);cancel(heartbeat);cancel(deadline);const previous=socket;socket=null;previous?.close();if(clear){owner=null;for(const channel of channels){channel.active=false;safe(channel.status,'CLOSED');}channels.clear();}}
 function deliver(channel,message){
  if(!channel.subscribed){channel.subscribed=true;safe(channel.status,'SUBSCRIBED');}
  if(channel.kind==='snapshot')safe(channel.callback,{rows:message.rows});
  else if(message.table==='notifications')safe(channel.callback,{eventType:'UPDATE',schema:'public',table:message.table,new:{},old:{}});
  else{for(const row of message.rows){if(!channel.seen.has(row.id))safe(channel.callback,{eventType:'INSERT',schema:'public',table:message.table,new:row,old:{}});}channel.seen=new Set(message.rows.map(row=>row.id));}
 }
 function retryLater(){if(destroyed||!active().length)return;cancel(retry);retry=schedule(()=>void connect(),Math.min(30000,1000*2**Math.min(attempt++,5)));retry?.unref?.();}
 async function authenticate(current){
  const restored=await identity.getSession();if(current!==generation||destroyed)return;
  if(restored.error||!restored.data?.session)throw Error('Session unavailable');
  const session=restored.data.session;if(owner&&owner!==session.user.id){disconnect(true);return;}owner=session.user.id;
  send({action:'authenticate_user',token:session.access_token});cancel(deadline);deadline=schedule(()=>{if(current===generation){disconnect();for(const channel of active()){channel.subscribed=false;safe(channel.status,'CHANNEL_ERROR');}retryLater();}},8000);deadline?.unref?.();
 }
 async function connect(){
  if(destroyed||connecting||socket||!active().length)return;
  connecting=true;const current=++generation;
  try{
   const restored=await identity.getSession();if(current!==generation||destroyed||!active().length)return;
   if(restored.error||!restored.data?.session)throw Error('Session unavailable');
   if(owner&&owner!==restored.data.session.user.id){disconnect(true);return;}owner=restored.data.session.user.id;
   const next=new WebSocketImpl(endpoint.href);socket=next;
   next.onopen=()=>void authenticate(current).catch(()=>next.close());
   next.onmessage=event=>{
    if(current!==generation)return;
    try{
     if(typeof event.data!=='string'||event.data.length>270336||new TextEncoder().encode(event.data).length>270336)throw Error();
     const message=JSON.parse(event.data);
     if(message.type==='authenticated_user'){
      cancel(deadline);ready=true;attempt=0;
      const sent=new Set();for(const channel of active()){const key=contract(channel);if(!sent.has(key)){send({action:'subscribe_private',table:channel.spec.table,filterId:channel.spec.filterId});sent.add(key);}}
      cancel(heartbeat);heartbeat=schedule(()=>void authenticate(current).catch(()=>next.close()),30000);heartbeat?.unref?.();return;
     }
     if(!ready||message.type!=='private_snapshot'||!Array.isArray(message.rows)||message.rows.length>100)throw Error();
     if(!['notifications','room_messages'].includes(message.table))throw Error();
     if(message.table==='notifications'&&message.filterId!==owner)throw Error();
     if(message.rows.some(row=>!row||typeof row.id!=='string'||row[message.table==='notifications'?'user_id':'room_id']!==message.filterId))throw Error();
     if(active().some(channel=>channel.spec.table===message.table&&channel.spec.filterId===message.filterId))lastSnapshots.set(message.table+':'+message.filterId,message);
     for(const channel of active()){
      if(channel.spec.table!==message.table||channel.spec.filterId!==message.filterId)continue;
      deliver(channel,message);
     }
    }catch{next.close(1008,'Invalid subscription response');}
   };
   next.onerror=()=>next.close();
   next.onclose=()=>{if(current!==generation)return;socket=null;ready=false;connecting=false;lastSnapshots.clear();cancel(heartbeat);cancel(deadline);for(const channel of active()){channel.subscribed=false;safe(channel.status,'CHANNEL_ERROR');}retryLater();};
  }catch{if(current===generation){connecting=false;for(const channel of active())safe(channel.status,'CHANNEL_ERROR');retryLater();}}
 }
 function removeChannel(channel){
  const wasActive=channel.active;channel.active=false;channels.delete(channel);safe(channel.status,'CLOSED');
  if(wasActive&&ready&&!active().some(other=>contract(other)===contract(channel))){lastSnapshots.delete(contract(channel));try{send({action:'unsubscribe_private',table:channel.spec.table,filterId:channel.spec.filterId});}catch{socket?.close();}}
  if(!active().length)disconnect();return Promise.resolve('ok');
 }
 const authSubscription=identity.onAuthStateChange?.((event,session)=>{if(event==='SIGNED_OUT'||owner&&session&&session.user.id!==owner)disconnect(true);});
 return {
  channel(name){
   if(destroyed||typeof name!=='string'||!name||name.length>200)throw Error('Invalid channel');
   const channel={active:false,subscribed:false,seen:new Set(),spec:null,kind:null,callback:null,status:null,
    on(kind,options,callback){
     if(this.active||this.spec||!['snapshot','postgres_changes'].includes(kind)||!['notifications','room_messages'].includes(options?.table)||typeof callback!=='function'||options.schema&&options.schema!=='public')throw Error('Unsupported subscription contract');
     const field=options.table==='notifications'?'user_id':'room_id',match=new RegExp('^'+field+'=eq\\.([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$','i').exec(options.filter??'');
     if(!match||kind==='postgres_changes'&&options.event!==(options.table==='notifications'?'*':'INSERT'))throw Error('Unsupported subscription filter');
     this.spec={table:options.table,filterId:match[1]};this.kind=kind;this.callback=callback;return this;
    },
    subscribe(status){
     if(!this.spec||this.active||channels.size>=16)throw Error('Channel unavailable');this.active=true;this.status=status;channels.add(this);
     if(ready){try{send({action:'subscribe_private',table:this.spec.table,filterId:this.spec.filterId});const cached=lastSnapshots.get(contract(this));if(cached)queueMicrotask(()=>{if(this.active&&ready&&channels.has(this))deliver(this,cached);});}catch{socket?.close();}}else void connect();return this;
    },
    unsubscribe(){return removeChannel(this);},
   };return channel;
  },
  removeChannel,
  destroy(){destroyed=true;disconnect(true);authSubscription?.data?.subscription?.unsubscribe();},
 };
}
