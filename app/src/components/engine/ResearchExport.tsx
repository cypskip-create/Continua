import {downloadResearchReport} from '@/lib/researchReport';
export function ExportResearch({name,data}:{name:string;data:unknown}) {
 return <button type="button" className="rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-full" onClick={()=>{
  downloadResearchReport(name,data);
 }}>Export readable report</button>;
}
