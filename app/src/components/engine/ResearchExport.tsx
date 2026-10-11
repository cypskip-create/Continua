export function ExportResearch({name,data}:{name:string;data:unknown}) {
 return <button type="button" className="rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-full" onClick={()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`${name.replace(/[^a-z0-9-]/gi,'-')}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }}>Export research snapshot</button>;
}
