import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {engineApi,type EngineBundle} from '@/api/engineApi';
import {engineReadRetry} from '@/api/engineRetry';
import {useAuth} from './useAuth';
import {useProfile} from './useProfile';
import {freshCacheTime} from '@/lib/researchCache';
import {ContinuaApiError} from '@/api/client';
const prefix='continua:company-engine:';
// Only company research, never personal workspace/portfolio/journal data.
// Each user's cached bundle is tier-bound and expires after one day. Paid
// APIs still enforce access. Profile must resolve before using this hint.
export function useEngineBundle(symbol:string,exchange:string,enabled:boolean,refreshNews:boolean) {
  const {user}=useAuth(),{profile,loading,refetch:refreshAccount}=useProfile();
  const plan=profile?.subscription_plan;
  const paid=plan==='premium'||plan==='premium_plus';
  const owner=user?.id;
  const storageKey=`${prefix}${owner}:${plan}:${exchange}:${symbol}`;
  const read=():{data:EngineBundle;updatedAt:number}|undefined=>{
    if(!owner||!paid||loading)return undefined;
    try {
      const cache=JSON.parse(localStorage.getItem(storageKey)??'null');
      if(cache?.owner===owner && cache.plan===plan && cache.data?.symbol===symbol && cache.data?.exchange===exchange && freshCacheTime(cache.updatedAt))return cache;
    }catch{ /* Cache optional. */ }
    return undefined;
  };
  const query=useQuery({queryKey:['continua','engine',owner,plan,exchange,symbol],
    queryFn:()=>engineApi.get(symbol,exchange),enabled:enabled&&paid&&!!owner&&!loading,
    initialData:()=>read()?.data,initialDataUpdatedAt:()=>read()?.updatedAt,
    staleTime:60_000,refetchOnMount:'always',retry:engineReadRetry,
    refetchInterval:refreshNews?60_000:false,refetchOnReconnect:true});
  useEffect(()=>{
    if(query.error instanceof ContinuaApiError && [401,403].includes(query.error.status)) {
      try { localStorage.removeItem(storageKey); }catch{ /* Storage optional. */ }
      void refreshAccount();
      return;
    }
    if(!query.data||!owner||!paid||query.isError)return;
    try {
      localStorage.setItem(storageKey,JSON.stringify({owner,plan,data:query.data,updatedAt:query.dataUpdatedAt}));
      const keys=Object.keys(localStorage).filter(key=>key.startsWith(`${prefix}${owner}:`));
      if(keys.length>15)keys.filter(key=>key!==storageKey).slice(0,keys.length-15).forEach(key=>localStorage.removeItem(key));
    }catch{ /* Quota/disabled storage never breaks research. */ }
  },[query.data,query.dataUpdatedAt,query.isError,query.error,owner,plan,paid,storageKey,refreshAccount]);
  return query;
}
