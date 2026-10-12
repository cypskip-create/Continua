import {describe,it,expect} from 'vitest';
import {stockTabDocuments} from '../../../src/adapters/kenyanstocks/tabPlan.js';
import {extractStockTables,publisherDate,publisherNumber} from '../../../src/adapters/kenyanstocks/stockTables.js';
describe('KenyanStocks complete collection',()=>{
 it('queues every main tab and financial category independently',()=>{
  const docs=stockTabDocuments('https://kenyanstocks.com/stock/nse/COOP');
  expect(docs).toHaveLength(12);expect(new Set(docs.map(d=>d.url)).size).toBe(12);
  expect(docs.filter(d=>d.context?.tab==='Financials')).toHaveLength(5);
  expect(docs.find(d=>d.context?.tab==='Historical Data')?.context?.historyStart).toBe('2015-01-01');
 });
 it('accepts observed future tabs but rejects foreign stock pages',()=>{
  expect(stockTabDocuments('https://kenyanstocks.com/stock/nse/COOP',['Summary','Research Notes','Research Notes'])).toHaveLength(2);
  expect(stockTabDocuments('https://evil.example/stock/nse/COOP')).toEqual([]);
 });
 it('preserves all years, labels, negative values and rounded precision',()=>{
  const tables=extractStockTables('<table><tr><th>Item</th><th>2024</th><th>2023</th><th>2022</th><th>2021</th></tr><tr><td>Operating expenses</td><td>(12.3 B)</td><td>11 B</td><td>10 B</td><td>9 B</td></tr></table>','Financials','Profit/Loss') as any[];
  expect(tables[0].columns).toEqual(['Item','2024','2023','2022','2021']);
  expect(tables[0].rows[0].cells).toHaveLength(4);
  expect(tables[0].rows[0].cells[0]).toMatchObject({value:-12.3e9,approximate:true,raw:'(12.3 B)'});
 });
 it('deduplicates responsive dates and flags invalid OHLC without fabricating adjustment',()=>{
  const tables=extractStockTables('<table><tr><th>Date</th><th>Open</th><th>Low</th><th>High</th><th>Close</th><th>Volume</th></tr><tr><td><span class="date-cell-lg">12 Oct 2026</span><span class="date-cell-sm">12/10/26</span></td><td>36.6</td><td>36.5</td><td>37</td><td>36.6</td><td>126.28K</td></tr><tr><td>09/10/26</td><td>36</td><td>40</td><td>37</td><td>36</td><td>100</td></tr></table>','Historical Data',null) as any[];
  expect(tables[0].adjustment).toBe('unknown');
  expect(tables[0].observations[0]).toMatchObject({date:'2026-10-12',volume:126280,volumeApproximate:true,valid:true});
  expect(tables[0].observations[1].valid).toBe(false);
 });
 it('rejects impossible dates and distinguishes percentage units',()=>{
  expect(publisherDate('31/02/26')).toBeNull();expect(publisherDate('9 Sept 2026')).toBe('2026-09-09');
  expect(publisherNumber('21.97%')).toEqual({value:21.97,unit:'percent',approximate:false});
  expect(publisherNumber('—').value).toBeNull();
 });
});
