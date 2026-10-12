import {expect,it} from 'vitest';
import {ForecastCreateSchema,ForecastRevisionSchema,privateCalibration,canReviseForecast,type NotebookForecast} from '../src/services/research/forecastNotebook.js';
const row:NotebookForecast={id:'id',symbol:'KCB',question:'Will revenue grow?',rules:'Compare annual audited group revenue with previous year.',deadline:'2025-12-31T23:59:59Z',probability:.8,revisions:[{at:'2025-01-01T00:00:00Z',probability:.5,rationale:'Baseline'},{at:'2025-06-01T00:00:00Z',probability:.8,rationale:'Reviewed filing'}],status:'resolved',outcome:true,resolution_source:'https://issuer.example/report',resolution_note:'Reported revenue exceeded prior year.',created_at:'2025-01-01T00:00:00Z',resolved_at:'2026-01-01T00:00:00Z'};
it('uses separate initial/latest Brier errors and excludes voids and post-deadline edits',()=>{
 const r=privateCalibration([row,{...row,status:'void',outcome:null}]);expect(r.resolvedCount).toBe(1);expect(r.initialBrier).toBe(.25);expect(r.latestBrier).toBeCloseTo(.04);
 expect(privateCalibration([{...row,revisions:[{...row.revisions[0]!,at:'2026-01-01T00:00:00Z'}]}]).resolvedCount).toBe(0);
});
it('locks revisions at deadline and rejects unbounded or forged input',()=>{
 expect(canReviseForecast({...row,status:'open'},new Date('2025-12-31T23:59:59Z'))).toBe(false);
 expect(canReviseForecast({...row,status:'open'},new Date('2025-12-30'))).toBe(true);
 expect(ForecastRevisionSchema.safeParse({probability:1.1,rationale:'Updated reason'}).success).toBe(false);
 expect(ForecastCreateSchema.safeParse({symbol:'KCB',question:row.question,rules:row.rules,deadline:row.deadline,probability:.5,rationale:'Baseline',userId:'forged'}).success).toBe(false);
});
