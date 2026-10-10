import { test } from "node:test";
import assert from "node:assert/strict";
import { bondHistory, bondHistoryKey } from "../src/lib/bondHistory.ts";
const observation=(id:string,date:string,basis:"accepted_auction"|"secondary_market"="accepted_auction",isin="KE6000001328")=>({id,kind:"bond" as const,title:"Issue",symbol:"FXD3",observedAt:date,sourceUrl:"https://www.centralbank.go.ke/report.pdf",payload:{isin,yieldBasis:basis,yield:12}});
test("bond history orders actual observations and isolates instruments and yield bases",()=>{
  const early=observation("1","2025-01-01"),late=observation("2","2026-01-01");
  const rows=bondHistory([late,observation("3","2026-01-01","secondary_market"),observation("4","2026-01-01","accepted_auction","OTHER"),early],bondHistoryKey(early));
  assert.deepEqual(rows.map(r=>r.id),["1","2"]);
});
test("a single source observation is retained, without inventing earlier values",()=>{
  const row=observation("1","2026-01-01");
  assert.equal(bondHistory([row],bondHistoryKey(row)).length,1);
  assert.deepEqual(bondHistory([row],"missing"),[]);
});
