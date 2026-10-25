import {useQuery} from '@tanstack/react-query';
import {continuaFetch} from '@/api/client';
import type {PublisherObservation} from '@/lib/publisherCharts';
import type {OwnershipRecord,FinancialHistoryEntry,ComputedRatios} from '@/api/types';
export {publisherFinancialPeriods} from '@/lib/publisherCharts';
export type PublisherResearch=PublisherObservation&{financialFields?:{metric:string;year:number;value:number;raw:string}[];ownership?:OwnershipRecord[];companyResearch?:{version:number;basis:'publisher_observation';history:FinancialHistoryEntry[];latest:FinancialHistoryEntry&{ratios:Partial<ComputedRatios>}|null}};
export function usePublisherResearch(symbol:string|undefined,enabled=true){
 return useQuery({queryKey:['continua','publisher-research',symbol],queryFn:()=>continuaFetch<PublisherResearch[]>(`/financials/${encodeURIComponent(symbol!)}/collected-research`,{params:{limit:100,destinations:'financials,overview,ownership'}}),enabled:enabled&&!!symbol,staleTime:60000,refetchInterval:300000,retry:1});
}
