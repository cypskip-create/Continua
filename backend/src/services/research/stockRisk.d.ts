export declare function riskHistory(securityId:string, quoteAsOf:unknown):Promise<{bars:{timestamp:string;close:number;volume?:number|null;sourceUrl?:string|null}[];actions:any[]}>;
export declare function getStockRisk(symbol:string):Promise<unknown>;
