import {expect,it} from 'vitest';
import {validOperatorKey,publicCollectorRoute} from '../src/api/operatorAccess.js';
it('fails closed without configuration and checks a bounded operator key',()=>{
 expect(validOperatorKey('x'.repeat(32),undefined)).toBe(false);expect(validOperatorKey('x'.repeat(32),'x'.repeat(32))).toBe(true);
 expect(validOperatorKey('wrong','x'.repeat(32))).toBe(false);expect(validOperatorKey('x'.repeat(513),'x'.repeat(513))).toBe(false);
});
it('exposes only bounded scheduler refreshes and minimal health/status, not archive or crawl controls',()=>{
 expect(publicCollectorRoute('GET','/health')).toBe(true);expect(publicCollectorRoute('POST','/news/refresh')).toBe(true);
 for(const path of ['/sources','/sources/kenyanstocks/crawl','/extractions/sweep','/extractions/needs-review','/artifacts/1/reprocess'])expect(publicCollectorRoute('POST',path)).toBe(false);
 expect(publicCollectorRoute('GET','/adapters/nse/announcements/preview')).toBe(false);
});
