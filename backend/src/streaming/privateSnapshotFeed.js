import {createHash} from 'node:crypto';
import {compileDataRequest,executeDataRequest} from '../data/browserData.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

// These are the only two private subscription contracts used by the app.
// The database role, row policies and live session guard apply on every read.
export async function readAuthorizedSnapshot({database,verifyAccess,token,table,filterId}){
 if(!['notifications','room_messages'].includes(table)||typeof filterId!=='string'||!uuid.test(filterId))throw Object.assign(Error('Invalid private subscription'),{status:400});
 const identity=await verifyAccess(token);
 if(table==='notifications'&&filterId!==identity.user.id)throw Object.assign(Error('Subscription owner mismatch'),{status:403});
 const search=new URLSearchParams({select:'*',limit:'100',order:'created_at.desc,id.desc',[table==='notifications'?'user_id':'room_id']:'eq.'+filterId});
 const result=await executeDataRequest(database,compileDataRequest({table,method:'GET',search}),identity.claims);
 if(Buffer.byteLength(result.json)>262144)throw Object.assign(Error('Private snapshot exceeds frame budget'),{status:413});
 return {rows:JSON.parse(result.json),digest:createHash('sha256').update(result.json).digest('hex')};
}

// A bounded reconciliation feed for the existing WebSocket transport. It polls
// only while subscribed, releases each SQL connection after its transaction,
// and sends changed snapshots. It is not a PostgreSQL change-log/CDC service.
export function createPrivateSnapshotFeed({readSnapshot,send,close,canSend=()=>true,schedule=setTimeout,cancel=clearTimeout,interval=5000}){
 if(!Number.isInteger(interval)||interval<5000||interval>60000)throw Error('Private feed polling interval must be between five and sixty seconds');
 const subscriptions=new Map();let timer,running=false,closed=false;
 const key=(table,id)=>table+':'+id;
 function stop(){closed=true;cancel(timer);subscriptions.clear();}
 async function tick(){
  if(closed||running||!subscriptions.size)return;
  cancel(timer);running=true;
  try{
   for(const [name,subscription] of [...subscriptions]){
    if(closed)break;
    const snapshot=await readSnapshot(subscription.table,subscription.filterId);
    if(closed||subscriptions.get(name)!==subscription)continue;
    if(snapshot.digest===subscription.digest)continue;
    if(!canSend()){stop();close(1013,'Consumer too slow');break;}
    send({type:'private_snapshot',table:subscription.table,filterId:subscription.filterId,rows:snapshot.rows});
    subscription.digest=snapshot.digest;
   }
  }catch(error){if(!closed){stop();close([400,401,403].includes(error.status)?1008:1011,'Private subscription unavailable');}}
  finally{running=false;if(!closed&&subscriptions.size){timer=schedule(()=>void tick(),interval);timer?.unref?.();}}
 }
 return {
  subscribe(table,filterId){
   if(closed||!['notifications','room_messages'].includes(table)||typeof filterId!=='string'||!uuid.test(filterId))throw Error('Invalid private subscription');
   const name=key(table,filterId);
   if(!subscriptions.has(name)){if(subscriptions.size>=2)throw Error('Private subscription capacity reached');subscriptions.set(name,{table,filterId,digest:null});}
   void tick();
  },
  unsubscribe(table,filterId){subscriptions.delete(key(table,filterId));if(!subscriptions.size)cancel(timer);},
  stop,
  refresh:tick,
 };
}
