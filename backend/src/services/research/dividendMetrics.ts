import type { CorporateAction } from '../../types/market.js';

/** Trailing twelve months means a date window, not the last four payments
 * (which can span years for annual/semiannual NSE dividends). */
export function trailingDividendPerShare(actions: CorporateAction[], now = new Date()): number | undefined {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const eligible = actions.filter((action) => {
    const date = action.exDate ? new Date(action.exDate).getTime() : NaN;
    return action.details.type === 'dividend' && action.status !== 'cancelled' &&
      date > cutoff.getTime() && date <= now.getTime();
  });
  if (!eligible.length) return undefined; // missing coverage is not a verified zero
  return eligible.reduce((sum, action) => sum + (action.details.type === 'dividend' ? action.details.amountPerShare : 0), 0);
}
