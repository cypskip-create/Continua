"""Point-in-time persisted research. Quote timestamp is the basis, not refresh time."""
from .dates import parse
from .numbers import positive, finite, compatible_currency
from .ratios import compute_ratios, yoy_growth
from .reported import reported_research_ratios
from .dividends import trailing_dividend_per_share
from .research_components import afri_score
from . import indicators


def research_snapshot(security_id, quote, history, candles, dividends, now, sector=''):
    instant, stamp = parse(now), parse(quote.get('timestamp')) if quote else None
    if instant is None or stamp is None or stamp > instant or quote.get('source') == 'mock' or not positive(quote.get('lastPrice')):
        return None
    eligible = sorted([r for r in history if compatible_currency(r.get('currency'),quote.get('currency')) and r.get('reportedAt') and r.get('periodEnd') and r['reportedAt'][:10] <= quote['timestamp'][:10] and r['periodEnd'][:10] <= quote['timestamp'][:10]
                       and any(isinstance(u, str) and u.lower().startswith('https://') for u in r.get('sourceUrls') or [])], key=lambda r: r['fiscalYear'])
    if not eligible: return None
    latest = eligible[-1]
    prior = next((r for r in eligible if r['fiscalYear'] == latest['fiscalYear'] - 1), None)
    closes = [c['close'] for c in candles if finite(c.get('close')) and parse(c.get('timestamp')) is not None and parse(c['timestamp']) <= stamp]
    dps = trailing_dividend_per_share(dividends, quote['timestamp'])
    ratio_input = {key: latest.get(key) for key in ['sharesOutstanding', 'netIncome', 'eps', 'revenue', 'ebitda', 'operatingIncome', 'grossProfit', 'totalEquity', 'totalAssets', 'totalDebt', 'cash', 'currentAssets', 'currentLiabilities']}
    ratio_input.update({'price': quote['lastPrice'], 'dividendPerShareTtm': dps, 'priceHistory90d': closes})
    ratios = compute_ratios(ratio_input)
    # Exactly the same annual denominator policy as the company bundle and
    # historical distribution. An older quote never gains a newer filing.
    dated = reported_research_ratios(security_id, quote, eligible, dps, now)
    for key in ('pe', 'pb', 'ps'):
        if key in dated: ratios[key] = dated[key]
        else: ratios.pop(key, None)
    record = {'securityId': security_id, 'asOf': quote['timestamp'], **ratios}
    score = afri_score(security_id, {'ratios': ratios, 'sector': sector, 'basis': latest.get('basis') or 'reviewed_filing',
                                   'fiscalYear': latest.get('fiscalYear'), 'filingDateKnown': bool(latest.get('reportedAt')), 'filingDate': latest.get('reportedAt'), 'financialPeriodEnd': latest.get('periodEnd'), 'priceAsOf': quote.get('timestamp'), 'sourceUrls': latest.get('sourceUrls') or [], 'calculatedAt': now,
                                   'revenueGrowthYoy': yoy_growth(latest.get('revenue'), prior.get('revenue')) if prior else None,
                                   'epsGrowthYoy': yoy_growth(latest.get('eps'), prior.get('eps')) if prior else None})
    score['asOf'] = quote['timestamp']
    return {'ratios': record, 'score': score}


def technical_results(symbol, exchange, candles, requests):
    if not candles: return [None for _ in requests]
    timestamps = [c['timestamp'] for c in candles]
    result = []
    for request in requests:
        kind = request['type']
        if kind == 'MACD':
            values = indicators.macd(candles, request.get('fast', 12), request.get('slow', 26), request.get('signal', 9))
            latest = {key: series[-1] if series else None for key, series in values.items()}
        elif kind in ('SMA', 'EMA', 'RSI'):
            period = request.get('period', 14 if kind == 'RSI' else 20)
            values = {'SMA': indicators.sma, 'EMA': indicators.ema, 'RSI': indicators.rsi}[kind](candles, period)
            latest = next((value for value in reversed(values) if value is not None), None)
        else: raise ValueError('Unsupported indicator')
        result.append({'symbol': symbol, 'exchange': exchange, 'type': kind, 'timestamps': timestamps, 'values': values, 'latest': latest})
    return result
