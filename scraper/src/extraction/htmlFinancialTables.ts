import * as cheerio from 'cheerio';

/** Preserve real table columns/period headers; never guess units or fiscal years. */
export function extractHtmlFinancialTables(html: string) {
  const $ = cheerio.load(html);
  const tables: { title: string | null; headerLine: string | null; rows: { label: string; values: string[] }[]; method: string; confidence: number }[] = [];
  $('table').each((_, table) => {
    const rows: { label: string; values: string[] }[] = [];
    const headers: string[] = [];
    $(table).find('tr').each((_, tr) => {
      const cells = $(tr).children('th,td').map((_, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
      if (cells.length < 2) return;
      if ($(tr).children('th').length > 1 || cells.slice(1).every((cell) => /^(?:FY\s*)?20\d{2}$/.test(cell))) {
        headers.push(cells.join(' | ')); return;
      }
      if (cells[0] && /[a-z]/i.test(cells[0]) && cells.slice(1).some((cell) => /^\(?-?\d[\d, .]*\)?%?$/.test(cell)))
        rows.push({ label: cells[0], values: cells.slice(1) });
    });
    if (rows.length < 2) return;
    tables.push({ title: $(table).find('caption').text().trim() || null, headerLine: headers.join('\n') || null,
      rows, method: 'html_table_v1', confidence: 0.7 });
  });
  return tables;
}
