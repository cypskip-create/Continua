import {continuaFetch} from './client';
export interface RiskDriver {symbol:string;sector:string;weight:number;marginalVolatility:number;componentVolatility:number;riskPercent:number}
export interface Attribution {dailyVolatility:number|null;contributions:RiskDriver[];sectors:{sector:string;componentVolatility:number;riskPercent:number}[];reconciliationError:number|null;diversificationRatio:number|null}
export interface RiskEvidence {methodologyVersion:string;calculatedAt:string;marketDataAsOf:string|null;portfolioSnapshotDate:string;valuationDates:string[];synchronizedValuation:boolean;sampleStart:string|null;sampleEnd:string|null;observations:number;minimumObservations:number;sources:string[];quality:string;returnConvention:string;annualizationReason:string;performanceBasis:string;limitations:string[]}
export interface RiskIntelligence {
 version:string; overview:{coveredValue:number;riskCoveredValue:number;largestWeight:number|null;topFiveWeight:number;dailyVolatility:number|null;annualizedVolatility:null;maxDrawdown:number|null;sectors:{sector:string;weight:number}[];positions:{symbol:string;sector:string;weight:number;value:number;asOf:string|null}[]};
 coverage:{symbol:string;included:boolean;reason:string|null;observations:number;priceAsOf:string|null;lastHistoryDate:string|null;unchangedFraction:number|null;latestVolume:number|null;sector:string}[];
 replays:{id:string;start:string;end:string;observations:number}[];symbols:string[];weights:number[];covariance:number[][]|null;attribution:Attribution;
 pairs:{a:string;b:string;correlation:number|null;observations:number;start:string|null;end:string|null;rolling:{date:string;correlation:number|null;observations:number}[]}[];
 stocks:{symbol:string;dailyVolatility:number;maxDrawdown:number;downsideDeviation:number;observations:number;benchmarkBeta:null;benchmarkReason:string}[];evidence:RiskEvidence;
}
export interface Scenario {historicalReplay?:string;marketShock?:number;sectorShocks?:Record<string,number>;holdingShocks?:Record<string,number>;topFiveShock?:number}
export interface SimulationInput {weights?:Record<string,number>;cashWeight?:number;maxHoldingWeight?:number;maxSectorWeight?:number;scenario?:Scenario}
interface Stress {pnl:number;stressedValue:number;returnPercent:number|null;holdings:{symbol:string;sector:string;value:number;shock:number;pnl:number}[];sectors:Record<string,number>}
export interface RiskSimulation {simulation:true;coveredValue:number;weights:Record<string,number>;cashWeight:number;sectors:Record<string,number>;attribution:Attribution;current:Stress;proposed:Stress;scenario:Scenario;overlapRule:string;limitations:string[];evidence:RiskEvidence}
export const simulateRisk=(body:SimulationInput)=>continuaFetch<RiskSimulation>('/engine/labs/intelligence',{method:'POST',body});
