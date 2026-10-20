import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {engineApi} from '@/api/engineApi';
import {engineReadRetry} from '@/api/engineRetry';
import {useAuth} from './useAuth';
import {useProfile} from './useProfile';
import {ContinuaApiError} from '@/api/client';
export function useEngineBundle(symbol:string,exchange:string,enabled:boolean,refreshNews:boolean) {
  const {user}=useAuth(),{profile,loading,refetch:refreshAccount}=useProfile();
  const plan=profile?.subscription_plan;
  const paid=plan==='premium'||plan==='premium_plus';
  const owner=user?.id;
  const query=useQuery({queryKey:['continua','engine',owner,plan,exchange,symbol],
    queryFn:()=>engineApi.get(symbol,exchange),enabled:enabled&&paid&&!!owner&&!loading,
    staleTime:60_000,refetchOnMount:'always',retry:engineReadRetry,
    refetchInterval:refreshNews?60_000:false,refetchOnReconnect:true});
  useEffect(()=>{
    if(query.error instanceof ContinuaApiError && [401,403].includes(query.error.status)) {
      void refreshAccount();
      return;
    }
  },[query.error,refreshAccount]);
  return query;
}
