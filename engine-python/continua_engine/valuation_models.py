"""Illustrative valuation math; required missing inputs retain explicit reasons."""
import math
from datetime import datetime, timezone
from .dates import parse, prior_year
from .dividends import trailing_dividend_per_share
from .numbers import finite, compatible_currency

CAVEAT = "Illustrative starting points, not price targets or investment advice. Each model relies on simplifying assumptions (see each model's methodology) and on the most recent annual financials on file, which may lag the current fiscal year."
RELATIVE_METHOD = "Applies the sector's average reported-annual P/E to this security's reported EPS, using the same fiscal year. Excludes this security and loss-making peers. Annual EPS is not TTM or a forward estimate; quote dates can differ."
GRAHAM_METHOD = "Benjamin Graham's formula: √(22.5 × EPS × Book Value per Share). Originally calibrated for defensive-investor screening in a different era/market; treat as a conservative floor estimate, not a target."
DIVIDEND_METHOD = "Single-stage Gordon Growth Model: Fair Value = D₁ / (r − g), where D₁ is next year's expected dividend (TTM dividend grown by the historical growth rate), r is an assumed required return, and g is the historical dividend growth rate, capped well below r to keep the formula stable. Assumes constant growth forever, which real companies never actually deliver — treat this as illustrative for income-focused comparison, not a target."


def rounded(value):
    return math.floor(value * 100 + .5) / 100 if finite(value) and finite(value * 100) else None


def unavailable(name, price, methodology, reason, inputs=None):
    return {'model': name, 'fairValue': None, 'currentPrice': price, 'upsidePercent': None, 'inputs': inputs or {}, 'methodology': methodology, 'unavailableReason': reason}


def upside(value, price):
    return rounded((value - price) / price * 100) if value is not None and price != 0 else None


def reported_eps(financials, positive_shares=False):
    if not financials: return None
    eps, shares, income = financials.get('eps'), financials.get('sharesOutstanding'), financials.get('netIncome')
    if eps is not None: return eps
    if finite(shares) and shares != 0 and (not positive_shares or shares > 0):
        return income / shares if finite(income) else None
    return None


def relative_valuation(price, financials, sector_id, sector):
    name = 'Relative Valuation (Sector P/E)'
    if not sector_id:
        return unavailable(name, price, RELATIVE_METHOD, 'No sector classification on file for this security.')
    eps = reported_eps(financials, True)
    if not finite(eps) or eps <= 0:
        return unavailable(name, price, RELATIVE_METHOD, 'Positive reported EPS available on the quote date is required; EPS is never inferred from a cached P/E.')
    sample = sector['sampleSize']
    if not sector.get('avgPe') or sample < 3:
        return unavailable(name, price, RELATIVE_METHOD, f'Fewer than 3 profitable, dated, same-year sector peers (found {sample}) — not enough for a meaningful sector average.', {'sectorPeerCount': sample})
    fair_value = rounded(sector['avgPe'] * eps)
    return {'model': name, 'fairValue': fair_value, 'currentPrice': price, 'upsidePercent': upside(fair_value, price),
            'inputs': {'reportedAnnualEps': rounded(eps), 'fiscalYear': financials['fiscalYear'], 'sectorAveragePe': rounded(sector['avgPe']), 'sectorPeerCount': sample}, 'methodology': RELATIVE_METHOD}


def graham_number(price, financials):
    name = 'Graham Number'
    if not financials:
        return unavailable(name, price, GRAHAM_METHOD, 'No fundamentals on file for this security yet.')
    eps, shares, equity = reported_eps(financials), financials.get('sharesOutstanding'), financials.get('totalEquity')
    book = equity / shares if finite(equity) and finite(shares) and shares > 0 else None
    if not finite(eps) or not finite(book) or eps <= 0 or book <= 0:
        return unavailable(name, price, GRAHAM_METHOD, 'Requires positive EPS, positive book value per share, and shares outstanding on file — at least one is missing or non-positive.')
    fair_value = rounded(math.sqrt(22.5 * eps * book))
    return {'model': name, 'fairValue': fair_value, 'currentPrice': price, 'upsidePercent': upside(fair_value, price), 'inputs': {'eps': rounded(eps), 'bookValuePerShare': rounded(book)}, 'methodology': GRAHAM_METHOD}


def dividend_discount(price, dividends, now=None):
    instant = parse(now) if now is not None else datetime.now(timezone.utc)
    if instant is None: raise ValueError('Invalid dividend observation time')
    payouts = [d for d in dividends if d['details'].get('type') == 'dividend']
    payouts.sort(key=lambda d: parse(d.get('exDate') or d['announcedAt']) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    ttm = trailing_dividend_per_share(payouts, instant.isoformat())
    prior_ttm = trailing_dividend_per_share(payouts, prior_year(instant).isoformat())
    name = 'Dividend Discount Model'
    if ttm is None or ttm <= 0 or prior_ttm is None or prior_ttm <= 0 or price <= 0:
        return unavailable(name, price, DIVIDEND_METHOD, 'Requires positive recorded dividends in two consecutive twelve-month windows and a positive market price. Annual and semiannual payers are supported; growth is not invented.')
    growth = max(-.05, min(.08, (ttm - prior_ttm) / prior_ttm))
    required_return = .12  # Explicit illustrative assumption, never a fetched risk-free rate.
    next_dividend = ttm * (1 + growth)
    fair_value = rounded(next_dividend / (required_return - growth))
    return {'model': name, 'fairValue': fair_value, 'currentPrice': price, 'upsidePercent': upside(fair_value, price),
            'inputs': {'ttmDividend': rounded(ttm), 'estimatedGrowthRatePercent': rounded(growth * 100), 'assumedRequiredReturnPercent': rounded(required_return * 100)}, 'methodology': DIVIDEND_METHOD}


def valuation_bundle(symbol, exchange, quote, financials, dividends, sector_id, sector, now):
    if not quote: return None
    dated = financials if financials and compatible_currency(financials.get('currency'),quote.get('currency')) and financials.get('reportedAt') and financials.get('periodEnd') and financials['reportedAt'][:10] <= quote['timestamp'][:10] and financials['periodEnd'][:10] <= quote['timestamp'][:10] else None
    price = quote['lastPrice']
    result = {'symbol': symbol, 'exchange': exchange, 'currentPrice': price, 'currency': quote['currency'], 'priceAsOf': quote['timestamp'],
            'models': [relative_valuation(price, dated, sector_id, sector), graham_number(price, dated), dividend_discount(price, dividends, now)], 'caveat': CAVEAT}
    import pathlib
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'backend' / 'python'))
    from engine_calculations import value_rating
    return dict(result, rating=value_rating(result, now))
