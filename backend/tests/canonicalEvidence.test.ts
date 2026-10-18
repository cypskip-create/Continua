import {expect,it} from 'vitest';
import {companyDiagnostics} from '../src/services/research/companyDiagnostics.js';
import {researchReadiness} from '../src/services/research/researchReadiness.js';
import {reportedResearchRatios} from '../src/services/research/reportedResearch.js';

const row={fiscalYear:2024,revenue:20.94e9,netIncome:526.05e6,eps:6.56,
    basis:'publisher_observation' as const,sourceUrls:['https://fixture.invalid/cgen']};
it('retains undated observations while explaining point-in-time exclusion',()=>{
    const quote={securityId:'NSE:CGEN',symbol:'CGEN',exchange:'NSE',lastPrice:30,timestamp:'2026-10-17T12:00:00Z',source:'live',currency:'KES'};
    const result=researchReadiness({quote,history:[row],unavailable:[],technicalObservations:0,estimateCount:0,ownershipCount:0},new Date('2026-10-18T12:00:00Z'));
    expect(result.capabilities.find(c=>c.id==='statements')?.observed).toBe(1);
    expect(result.capabilities.find(c=>c.id==='dated-statements')?.observed).toBe(0);
    expect(reportedResearchRatios('NSE:CGEN',quote,[row],null,new Date('2026-10-18'))).toBeNull();
});
it('uses the same observation in the check and its expanded evidence',()=>{
    const result=companyDiagnostics([row]);
    expect(result.checks.find(c=>c.id==='profit')).toMatchObject({result:'pass',inputs:{netIncome:526.05e6},fiscalYear:2024});
    expect(result.evidence.find(e=>e.field==='netIncome')).toMatchObject({value:526.05e6,basis:'Third-party mapped observation'});
});
it('marks industrial leverage, cash conversion and liquidity inapplicable to banks',()=>{
    const result=companyDiagnostics([row],'Banking');
    for(const id of ['cash','leverage','liquidity'])expect(result.checks.find(c=>c.id===id)?.result).toBe('not_applicable');
    expect(result.knownChecks).toBe(1);
});
