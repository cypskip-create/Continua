import { it, expect } from 'vitest';
import { extractHtmlFinancialTables } from '../../src/extraction/htmlFinancialTables.js';
it('preserves historical columns and units for downstream review', () => {
  const tables = extractHtmlFinancialTables('<table><caption>KES millions</caption><tr><th>Year</th><th>2025</th><th>2024</th></tr><tr><td>Revenue</td><td>12,300</td><td>11,000</td></tr><tr><td>Profit</td><td>900</td><td>(50)</td></tr></table>');
  expect(tables[0]).toMatchObject({ title: 'KES millions', headerLine: 'Year | 2025 | 2024', rows: [{ label: 'Revenue', values: ['12,300', '11,000'] }, { label: 'Profit', values: ['900', '(50)'] }] });
});
it('rejects layout tables with no financial values', () => {
  expect(extractHtmlFinancialTables('<table><tr><td>Home</td><td>About</td></tr><tr><td>Contact</td><td>Help</td></tr></table>')).toEqual([]);
});
