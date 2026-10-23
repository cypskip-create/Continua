import {useQuery} from '@tanstack/react-query';
import {valuationApi,type ValuationResult} from '@/api/valuationApi';
import {useExchange} from './useExchange';
export function usePortfolioValuations(symbols:string[]){
 const {exchange}=useExchange(),unique=[...new Set(symbols.map(s=>s.toUpperCase()))].sort();
 const query=useQuery({queryKey:['continua','portfolio-valuations-v3',exchange,unique.join(',')],enabled:unique.length>0,staleTime:300000,retry:1,queryFn:async()=>{const items:Record<string,ValuationResult|undefined>={};for(let i=0;i<unique.length;i+=20){const result=await valuationApi.batch(unique.slice(i,i+20),exchange);for(const [key,value]of Object.entries(result.items))items[key]=value??undefined;}return items;}});
 return {valuations:query.data??{},isLoading:unique.length>0&&query.isLoading,error:query.error};
}
