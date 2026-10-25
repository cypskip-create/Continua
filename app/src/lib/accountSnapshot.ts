import type {Profile} from '../hooks/useProfile';
type StorageView=Pick<Storage,'getItem'|'setItem'>;
export const ACCOUNT_SNAPSHOT_PREFIX='continua:account:';
// Display hint only, after live identity restoration. Paid APIs retain server
// authorization. Never store tokens, passwords or another owner's profile.
export function readAccountSnapshot(storage:StorageView,userId:string,now=Date.now()):{profile:Profile;updatedAt:number}|undefined{
 try{const value=JSON.parse(storage.getItem(ACCOUNT_SNAPSHOT_PREFIX+userId)??'null');
  if(value?.profile?.user_id===userId&&['free','premium','premium_plus'].includes(value.profile.subscription_plan)&&typeof value.updatedAt==='number'&&value.updatedAt>0&&value.updatedAt<=now&&now-value.updatedAt<24*60*60_000)return value;
 }catch{/* Optional storage. */}return undefined;
}
export function saveAccountSnapshot(storage:StorageView,userId:string,profile:Profile,updatedAt:number){
 if(profile.user_id!==userId)return;
 try{storage.setItem(ACCOUNT_SNAPSHOT_PREFIX+userId,JSON.stringify({profile,updatedAt}));}catch{/* Optional storage. */}
}
