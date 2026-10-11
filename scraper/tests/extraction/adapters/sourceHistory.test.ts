import {it,expect,vi} from 'vitest';
vi.mock('../../../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
vi.mock('../../../src/config/index.js',()=>({env:{DEFAULT_MAX_RETRIES:0}}));
import {kenyanFileLinks,kenyanStockLinks} from '../../../src/adapters/kenyanstocks/archiveLinks.js';
import {afxProfileFacts,afxCloseCandidates} from '../../../src/adapters/afx/afxAdapter.js';
it('discovers observed NSE paths and schema file links without following foreign assets',()=>{
 expect(kenyanStockLinks('<a href="/stock/nse/KCB">KCB</a><a href="/stock/nyse/KCB">foreign</a>')).toEqual(['https://kenyanstocks.com/stock/nse/KCB']);
 const html='<div class="file-content"><h3>Group report 2020</h3><time datetime="2025-12-22"></time><link itemprop="url" href="https://assets.kenyanstocks.com/files/id/report.pdf"></div>';
 const result=kenyanFileLinks(html,'https://kenyanstocks.com/stock/nse/KCB');
 expect(result[0]?.context?.listingUploadedAt).toBe('2025-12-22');
 expect(result[0]?.context?.mirror).toBe(true);
 expect(kenyanFileLinks(html.replace('assets.kenyanstocks.com','evil.test'),'https://kenyanstocks.com/stock/nse/KCB')).toEqual([]);
});
it('retains AFX facts and dated close-only observations; never creates candles or financial EPS',()=>{
 const html='<div data-fact><h3>Factsheet of KCB Group Plc</h3><dl><dt>Website</dt><dd>kcbgroup.com</dd><dt>Address</dt><dd>Nairobi</dd></dl></div><table><tr><th>Date</th><th>Volume</th><th>Close</th></tr><tr><td>2026-10-09</td><td>531,524</td><td>89.75</td></tr><tr><td>2026-02-30</td><td>5</td><td>9</td></tr></table>';
 expect(afxProfileFacts(html)?.facts.website).toBe('kcbgroup.com');
 const rows=afxCloseCandidates(html);expect(rows).toHaveLength(1);expect(rows[0]?.close).toBe(89.75);expect(rows[0]).not.toHaveProperty('high');
});
