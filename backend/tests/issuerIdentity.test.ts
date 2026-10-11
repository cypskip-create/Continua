import {it,expect} from 'vitest';
import {issuerMastheadMatches} from '../src/ingestion/normalizers/issuerIdentity.js';
it('recognizes exact legal mastheads, not subsidiary or incidental mentions',()=>{
 expect(issuerMastheadMatches('KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES','KCB Group')).toBe(true);
 expect(issuerMastheadMatches('KCB BANK BURUNDI LIMITED\nAudited results','KCB Group')).toBe(false);
 expect(issuerMastheadMatches('Investments include KCB Group','KCB Group')).toBe(false);
 expect(issuerMastheadMatches('CAR & GENERAL (KENYA) PLC\nAnnual report','Car and General Kenya Limited')).toBe(true);
});
