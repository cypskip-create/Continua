import {useQuery} from '@tanstack/react-query';
import {researchApi} from '@/api/researchApi';
import {useExchange} from './useExchange';
import type {ResearchBundle} from '@/api/types';
export function usePortfolioResearch(symbols:string[]){
 const {exchange}=useExchange(),unique=[...new Set(symbols.filter(Boolean).map(s=>s.toUpperCase()))].sort();
 const query=useQuery({queryKey:['continua','portfolio-research-v3',exchange,unique.join(',')],enabled:unique.length>0,staleTime:600000,retry:1,queryFn:async()=>{const items:Record<string,ResearchBundle|undefined>={};for(let i=0;i<unique.length;i+=20){const result=await researchApi.batch(unique.slice(i,i+20),exchange);for(const [key,value]of Object.entries(result.items))items[key]=value??undefined;}return items;}});
 return {research:query.data??{},isLoading:unique.length>0&&query.isLoading,error:query.error};
}
