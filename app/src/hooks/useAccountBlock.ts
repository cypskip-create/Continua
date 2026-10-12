import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from './useAuth';
import {COMMUNITY_SAFETY_CHANGED} from '@/components/social/SafetyMenuItems';
export function useAccountBlock(target?:string){
 const {user}=useAuth();const [state,setState]=useState<'loading'|'blocked'|'clear'|'error'>('loading');
 useEffect(()=>{let stopped=false;const load=async()=>{setState('loading');if(!user||!target||user.id===target){setState('clear');return;}
  const {data,error}=await supabase.from('blocked_users').select('id').eq('blocker_id',user.id).eq('blocked_id',target);
  if(!stopped)setState(error?'error':data?.length?'blocked':'clear');};void load();window.addEventListener(COMMUNITY_SAFETY_CHANGED,load);return()=>{stopped=true;window.removeEventListener(COMMUNITY_SAFETY_CHANGED,load);};},[user?.id,target]);
 return {state,unblock:async()=>{const {error}=await (supabase.rpc as any)('community_set_safety',{p_target:target,p_kind:'block',p_enabled:false});if(error)throw error;window.dispatchEvent(new Event(COMMUNITY_SAFETY_CHANGED));}};
}
