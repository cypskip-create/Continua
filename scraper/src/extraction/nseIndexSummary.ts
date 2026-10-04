import * as cheerio from 'cheerio';

const codes: Record<string, string> = {
  'NSE ALL SHARE INDEX': 'NASI', 'N.A.S.I': 'NASI', 'NASI': 'NASI',
  'NSE 20 SHARE INDEX': 'NSE20', 'NSE 20': 'NSE20',
  'NSE 25 SHARE INDEX': 'NSE25', 'NSE 25': 'NSE25',
  'NSE 10 SHARE INDEX': 'NSE10', 'NSE 10': 'NSE10',
};
export interface NseIndexObservation {
  kind: 'nse_index'; code: string; value: number; change: number; asOf: string;
}
/** Verified against NSE's stat_col/stat_figures markup. Never read unrelated
 * ticker prices or substitute scrape time for the publisher's observation date. */
export function extractNseIndexSummary(html: string): NseIndexObservation[] {
  const $ = cheerio.load(html);
  const date = $('.stat_date').first().text().match(/Statistics\s+As\s+of\s+(\d{2})-([A-Z]{3})-(\d{2}|\d{4})\b/i);
  if (!date) return [];
  const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(date[2]!.toUpperCase());
  const year = date[3]!.length === 2 ? 2000 + Number(date[3]) : Number(date[3]);
  const day = Number(date[1]);
  const asOf = new Date(Date.UTC(year, month, day));
  if (month < 0 || asOf.getUTCDate() !== day || asOf.getUTCMonth() !== month) return [];
  const rows = new Map<string, NseIndexObservation>();
  $('.nse_statistics .stat_col').each((_, element) => {
    const col = $(element);
    const code = codes[col.find('.stat_head').text().trim().toUpperCase()];
    if (!code) return;
    const figure = col.find('.stat_figures p').first();
    const changeText = figure.find('.stat_percent').text().trim().replaceAll(',', '').replace('−', '-');
    const level = figure.clone(); level.find('span').remove();
    const valueText = level.text().trim().replaceAll(',', '');
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(changeText) || !/^\d+(?:\.\d+)?$/.test(valueText)) return;
    const value = Number(valueText), change = Number(changeText);
    if (value <= 0 || value - change <= 0) return;
    rows.set(code, { kind: 'nse_index', code, value, change, asOf: asOf.toISOString() });
  });
  return [...rows.values()];
}
