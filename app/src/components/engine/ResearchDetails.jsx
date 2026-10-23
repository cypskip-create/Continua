const hidden=new Set(['inputHash','modelVersion','governance','artifactHashes','sourceUrls','sourceUrl','configuration']);
const label=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/^./,c=>c.toUpperCase());
export function ResearchDetails({data,depth=0}){
 if(data==null)return <span className="text-muted-foreground">Unavailable</span>;
 if(typeof data!=='object')return <span>{typeof data==='boolean'?(data?'Yes':'No'):typeof data==='number'?data.toLocaleString(undefined,{maximumFractionDigits:4}):String(data)}</span>;
 if(depth>8)return null;
 if(Array.isArray(data))return <ul className="space-y-2">{data.slice(0,100).map((value,index)=><li key={index}><ResearchDetails data={value} depth={depth+1}/></li>)}</ul>;
 return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(data).filter(([key])=>!hidden.has(key)).map(([key,value])=><div key={key} className="min-w-0 rounded-lg bg-muted/20 p-3"><dt className="text-xs text-muted-foreground">{label(key)}</dt><dd className="mt-1 text-sm break-words"><ResearchDetails data={value} depth={depth+1}/></dd></div>)}</dl>;
}
