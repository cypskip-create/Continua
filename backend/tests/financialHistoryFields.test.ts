import { describe, it, expect, vi } from "vitest";
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../src/storage/db.js",()=>({query}));
import {financialsRepository} from "../src/storage/repositories/financialsRepository.js";

describe("financial statement history presentation fields",()=>{
  it("returns stored costs and expenses without dropping nullable cash-flow fields",async()=>{
    query.mockResolvedValueOnce({rows:[{fiscalYear:2025,costOfRevenue:120,operatingExpenses:30,investingCashFlow:null}]});
    const rows=await financialsRepository.getHistoricalPeriods("fixture","annual",10);
    expect(query.mock.calls.at(-1)?.[0]).toContain('i.cost_of_revenue as "costOfRevenue"');
    expect(query.mock.calls.at(-1)?.[0]).toContain('i.operating_expenses as "operatingExpenses"');
    expect(rows[0]).toMatchObject({costOfRevenue:120,operatingExpenses:30,investingCashFlow:null});
  });
});
