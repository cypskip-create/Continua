"""Observed market statistics; missing evidence remains unavailable."""
from datetime import datetime, timedelta, timezone
import math


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def positive(value):
    return finite(value) and value > 0


def instant(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=timezone.utc) if len(value) == 10 else datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return None


def market_statistics(quote, history, candles, closes, now):
    now = instant(now)
    if now is None:
        raise ValueError('invalid statistics instant')
    quote = quote or {}
    timestamp = instant(quote.get('timestamp'))
    usable = quote.get('source') != 'mock' and timestamp is not None and timestamp <= now
    at = quote['timestamp'][:10] if usable else now.date().isoformat()
    price = quote.get('lastPrice') if usable and positive(quote.get('lastPrice')) else None
    eligible = [r for r in (history or []) if r.get('periodEnd') and r['periodEnd'][:10] <= at
                and (not r.get('reportedAt') or r['reportedAt'][:10] <= at)
                and (not r.get('currency') or not quote.get('currency') or r['currency'] == quote['currency'])]
    financial = max(eligible, key=lambda r: r.get('fiscalYear', 0), default={})
    shares = financial.get('sharesOutstanding') if positive(financial.get('sharesOutstanding')) else None
    eps = financial.get('eps') if finite(financial.get('eps')) else financial['netIncome'] / shares if finite(financial.get('netIncome')) and shares else None
    reported_cap = usable and positive(quote.get('marketCap'))
    cap = quote['marketCap'] if reported_cap else price * shares if price and shares else None
    by_date, conflicts = {}, set()
    for row in closes or []:
        day = (row.get('date') or row.get('timestamp') or '')[:10]
        if not positive(row.get('close')):
            continue
        if day in by_date and by_date[day]['close'] != row['close']:
            conflicts.add(day)
        else:
            by_date[day] = row
    for day in conflicts:
        by_date.pop(day, None)
    for row in candles or []:
        if all(positive(row.get(key)) for key in ('close', 'high', 'low')):
            by_date[str(row.get('timestamp', ''))[:10]] = row
    since, until = (now - timedelta(days=365)).date().isoformat(), now.date().isoformat()
    observed = sorted((day, row) for day, row in by_date.items() if since <= day <= until and instant(day) is not None)
    full = len(observed) >= 150 and instant(observed[0][0]) <= instant(since) + timedelta(days=7) and instant(observed[-1][0]) >= instant(until) - timedelta(days=7) and all(instant(b[0]) - instant(a[0]) <= timedelta(days=10) for a, b in zip(observed, observed[1:]))
    ohlc = all(positive(row.get('high')) and positive(row.get('low')) for _, row in observed)
    return dict(marketCap=cap, marketCapBasis='reported_quote' if reported_cap else 'price_times_reported_shares' if cap else 'unavailable',
                pe=price / eps if price and positive(eps) else None, eps=eps,
                volume=quote['volume'] if usable and finite(quote.get('volume')) and quote['volume'] >= 0 else None,
                high52=max(row['high' if ohlc else 'close'] for _, row in observed) if full else None,
                low52=min(row['low' if ohlc else 'close'] for _, row in observed) if full else None,
                rangeBasis='reported_daily_high_low' if ohlc else 'observed_closing_prices',
                priceAsOf=quote.get('timestamp'), financialYear=financial.get('fiscalYear'),
                financialPeriodEnd=financial.get('periodEnd'), filingDate=financial.get('reportedAt'),
                financialBasis=financial.get('basis') or ('reviewed_filing' if financial else 'unavailable'),
                sourceUrls=financial.get('sourceUrls') or [], sharesAsOf=financial.get('periodEnd') if shares else None,
                methodology='Market cap uses a reported quote or quoted price × last reported shares. P/E requires positive EPS. The 52-week range requires at least 150 dated observations, coverage near both boundaries and no gap over 10 days. Close-only extrema are labelled separately. No missing price, volume or filing date is generated.') | {'rangeCoverage': {'observations': len(observed), 'from': observed[0][0] if observed else None, 'to': observed[-1][0] if observed else None, 'complete': bool(full)}}
