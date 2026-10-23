/** Value today's share quantities using only each security's reported prices. */
export function portfolioValueHistory(holdings,series){
 if(!holdings.length||holdings.some(row=>!Number.isFinite(row.shares)||row.shares<=0))return [];
 const bySymbol=new Map(),dates=new Set();
 for(const [symbol,points]of Object.entries(series)){
  const values=new Map();
  for(const point of points??[]){const timestamp=new Date(point.timestamp).getTime(),price=point.close;
   if(!Number.isFinite(timestamp)||!Number.isFinite(price)||price<=0)continue;
   const date=new Date(timestamp).toISOString().slice(0,10);values.set(date,price);dates.add(date);
  }
  bySymbol.set(symbol.toUpperCase(),values);
 }
 const last=new Map(),result=[];
 for(const date of [...dates].sort()){
  let value=0,complete=true;
  for(const holding of holdings){const symbol=holding.symbol.toUpperCase(),reported=bySymbol.get(symbol)?.get(date);
   if(reported!=null)last.set(symbol,{price:reported,date});
   const previous=last.get(symbol),price=reported??(previous&&Date.parse(date)-Date.parse(previous.date)<=7*86400000?previous.price:undefined);
   if(price==null){complete=false;continue;}value+=price*holding.shares;
  }
  if(complete&&Number.isFinite(value))result.push({date,timestamp:Date.parse(date+'T00:00:00Z'),value});
 }
 return result;
}
