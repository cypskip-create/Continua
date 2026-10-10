// Local-only visual QA fixture. Not a production route and not real market data.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { InstrumentHistory } from "../../src/components/markets/InstrumentHistory";
import "../../src/index.css";
import "../../src/styles/brand-system.css";
function Preview() {
  const [kind,setKind]=useState<"Derivatives"|"USP">("Derivatives");
  return <main className="max-w-xl mx-auto p-5"><p className="text-sm text-muted-foreground mb-4">Local UI test · no market observations loaded</p><h1 className="text-2xl font-semibold mb-5">Markets</h1><div className="flex gap-3 mb-5">{(["Derivatives","USP"] as const).map(label => <button className={`pill-tab ${kind === label ? "contrast-active" : ""}`} key={label} onClick={() => setKind(label)}>{label}</button>)}</div><InstrumentHistory records={[]} kind={kind} loading={false} failed={false}/></main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
