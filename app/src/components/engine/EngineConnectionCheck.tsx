import { useState } from "react";
import { testEngineConnection } from "@/api/client";

export function EngineConnectionCheck({target,exchange}: {target:"portfolio"|"monitoring"|"preferences";exchange:string}) {
  const [report, setReport] = useState("");
  const [checking, setChecking] = useState(false);
  return <details className="border-t border-border pt-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground">Troubleshoot Engine connection</summary>
    <p className="my-2 text-muted-foreground">Checks public access and a signed-in Engine read. No settings are changed. The report contains no tokens, personal details or portfolio data.</p>
    <button className="rounded-lg border border-border px-3 py-2" disabled={checking} onClick={async()=>{
      setChecking(true);
      setReport("");
      try { setReport(await testEngineConnection(target,exchange)); }
      catch { setReport("Connection check could not complete. Reload the app and retry."); }
      finally { setChecking(false); }
    }}>{checking?"Checking connection…":"Check Engine connection"}</button>
    {report && <p role="status" className="mt-2 whitespace-pre-wrap break-words" aria-label="Engine connection report">{report}</p>}
  </details>;
}
