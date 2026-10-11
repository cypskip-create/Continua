import {expect,it} from 'vitest';
import {extractHtmlFinancialTables} from '../src/extraction/htmlFinancialTables.js';
it('keeps year/unit td headers and separated br text without merging numbers',()=>{
 const tables=extractHtmlFinancialTables(`<table><thead><tr><td></td><td>2025<br>Shs'000</td><td>2024<br>Shs'000</td></tr></thead><tbody><tr><td>Turnover</td><td>1,234</td><td>567</td></tr><tr><td>EPS (Shs)</td><td>1.2</td><td>(0.2)</td></tr><tr><td>Combined</td><td>123<br>456</td><td>789<br>012</td></tr></tbody></table>`);
 expect(tables[0]!.headerLine).toBe(" | 2025 Shs'000 | 2024 Shs'000");
 expect(tables[0]!.rows[0]!.values).toEqual(['1,234','567']);
 expect(tables[0]!.rows.find(r=>r.label==='Combined')?.values).not.toContain('123456');
});
