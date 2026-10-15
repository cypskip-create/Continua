"""Point-in-time annual filing ratios; no future filings or loss-based P/E."""
from .numbers import divide, positive, compatible_currency
from .dates import parse

def annual_ratio_at(periods, price, at, ratio):
    if ratio not in ("pe","pb","ps"):
        raise ValueError("invalid_ratio")
    date = at[:10]
    eligible = [p for p in periods if p.get("periodEnd") and p["periodEnd"]<=date and p.get("reportedAt") and p["reportedAt"][:10]<=date]
    eligible.sort(key=lambda p:(p["fiscalYear"],p["reportedAt"]),reverse=True)
    p = eligible[0] if eligible else None
    shares = p.get("sharesOutstanding") if p else None
    eps = p.get("eps") if p else None
    if eps is None and positive(shares):
        eps = divide(p.get("netIncome"),shares)
    denominator = eps if ratio=="pe" else divide(p.get("totalEquity") if ratio=="pb" else p.get("revenue"),shares) if p and positive(shares) else None
    return {"ratio":price/denominator if p and positive(price) and positive(denominator) else None,
            "price":price,"fiscalYear":p.get("fiscalYear") if p else None,"reportedAt":p.get("reportedAt") if p else None,
            "denominator":denominator if positive(denominator) else None,"sourceUrls":(p.get("sourceUrls") or []) if p else []}


def valuation_history(symbol, periods, quote, candles, ratio, currency=None):
    currency = currency if currency is not None else quote.get('currency') if quote else None
    periods = [p for p in periods if compatible_currency(p.get('currency'),currency)]
    daily = {}
    for candle in candles:
        if positive(candle.get('close')):
            daily[candle['timestamp'][:10]] = candle
    def observation(candle, price):
        stamp = parse(candle['timestamp'])
        return {'date': candle['timestamp'][:10], 'time': stamp.timestamp() * 1000 if stamp is not None else None,
                **annual_ratio_at(periods, price, candle['timestamp'], ratio)}
    points = [observation(candle, candle['close']) for candle in daily.values()]
    current = observation(quote, quote['lastPrice']) if quote else None
    return {'symbol': symbol, 'ratio': ratio, 'current': current, 'points': points,
            'lastHistoricalDate': points[-1]['date'] if points else None,
            'basis': 'Annual reported financials available on each observation date; not TTM or forward. Historical closes and the latest quote are distinct dated observations.'}
