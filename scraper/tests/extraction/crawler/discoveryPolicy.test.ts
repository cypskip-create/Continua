import { describe, expect, it } from 'vitest';
import { matchesDiscoveryPaths } from '../../../src/crawler/discoveryPolicy.js';

describe('issuer archive scope', () => {
  it('follows archived PDFs, not banking product menus', () => {
    const paths = ['/investor', '/financial', '.pdf'];
    expect(matchesDiscoveryPaths('https://kcbgroup.com/files/Annual-Report-2019.PDF', paths)).toBe(true);
    expect(matchesDiscoveryPaths('https://kcbgroup.com/financial-statements', paths)).toBe(true);
    expect(matchesDiscoveryPaths('https://kcbgroup.com/personal/loans', paths)).toBe(false);
  });
  it('preserves generic crawling when no paths configured', () => {
    expect(matchesDiscoveryPaths('https://example.com/news')).toBe(true);
  });
});
