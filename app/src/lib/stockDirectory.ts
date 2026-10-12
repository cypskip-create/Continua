import type { Instrument } from "../api/types";
import { NSE_SECURITIES, LEGACY_TICKER_ALIASES } from "../data/nseSecurities.ts";
export function stockDirectory(instruments: Instrument[]) {
  const references = new Map(NSE_SECURITIES.map(stock => [stock.ticker, stock]));
  if (!instruments.length) return NSE_SECURITIES.map(stock => ({symbol:stock.ticker,name:stock.name,sector:stock.sector,aliases:Object.entries(LEGACY_TICKER_ALIASES).filter(([,target])=>target===stock.ticker).map(([alias])=>alias)}));
  return instruments.filter(stock => stock.status !== 'delisted').map(stock => {
    const reference = references.get(LEGACY_TICKER_ALIASES[stock.symbol] ?? stock.symbol);
    return {symbol:stock.symbol,name:stock.companyName && stock.companyName !== stock.symbol ? stock.companyName : reference?.name ?? stock.symbol,
      sector:stock.sector && stock.sector !== 'Unknown' ? stock.sector : reference?.sector ?? 'Other',aliases:reference?.ticker && reference.ticker!==stock.symbol ? [reference.ticker] : []};
  });
}
