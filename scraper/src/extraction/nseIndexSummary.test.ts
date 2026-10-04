import { describe, it, expect } from 'vitest';
import { extractNseIndexSummary } from './nseIndexSummary.js';
const html = `<div class="stat_date">Statistics As of 02-OCT-26</div>
<div class="nse_statistics"><div class="stat_col"><div class="stat_head"><h3>NSE ALL SHARE INDEX</h3></div>
<div class="stat_figures"><p>247.32<span class="stat_percent">0.50</span></p></div></div>
<div class="stat_col"><div class="stat_head">NSE 20 SHARE INDEX</div>
<div class="stat_figures"><p>4,323.60<span class="stat_percent">−4.92</span></p></div></div></div>`;
describe('official NSE index observations', () => {
  it('reads date, level and signed point change, not a supposed percentage', () => {
    expect(extractNseIndexSummary(html)).toEqual([
      { kind: 'nse_index', code: 'NASI', value: 247.32, change: .5, asOf: '2026-10-02T00:00:00.000Z' },
      { kind: 'nse_index', code: 'NSE20', value: 4323.6, change: -4.92, asOf: '2026-10-02T00:00:00.000Z' },
    ]);
  });
  it('refuses missing/invalid observation dates and malformed levels', () => {
    expect(extractNseIndexSummary(html.replace('02-OCT-26', '31-FEB-26'))).toEqual([]);
    expect(extractNseIndexSummary(html.replace('Statistics As of', 'Updated'))).toEqual([]);
    expect(extractNseIndexSummary(html.replace('247.32', 'N/A'))).toHaveLength(1);
  });
});
