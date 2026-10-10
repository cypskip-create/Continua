// Local-only visual QA fixture. Not a production route and not real market data.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { InstrumentHistory } from "../../src/components/markets/InstrumentHistory";
import { BondHistory } from "../../src/components/markets/BondHistory";
import type { ResearchRecord } from "../../src/api/marketResearchApi";
import "../../src/index.css";
import "../../src/styles/brand-system.css";
function Preview() {
  const [kind,setKind]=useState<"Derivatives"|"USP">("Derivatives");
  const bonds:ResearchRecord[]=[{id:"test-only",kind:"bond",title:"Test bond (illustrative)",symbol:"TEST",observedAt:"2026-01-01",sourceUrl:"https://www.centralbank.go.ke/bills-bonds/treasury-bonds/",payload:{yield:12,price:100,unit:"KES per 100 face value",yieldBasis:"accepted_auction"}}];
  return <main className="max-w-xl mx-auto p-5"><p className="text-sm text-muted-foreground mb-4">Local UI test · illustrative bond, not market data</p><h1 className="text-2xl font-semibold mb-5">Markets</h1><div className="flex gap-3 mb-5">{(["Derivatives","USP"] as const).map(label => <button className={`pill-tab ${kind === label ? "contrast-active" : ""}`} key={label} onClick={() => setKind(label)}>{label}</button>)}</div><InstrumentHistory records={[]} kind={kind} loading={false} failed={false}/><BondHistory records={bonds}/></main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
