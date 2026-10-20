"""Deterministic Engine lab calculations; no database, network or credentials.

Validated caller-owned assumptions are passed on stdin. Preserve methodology
and missing-value semantics; do not generate market data or probabilities.
"""
import datetime
import json
import math
import sys

def c_score(security_id, inputs):
    """Continua's observed factor score, never a return forecast or analyst rating."""
    r = inputs.get('ratios') or {}
    finite = lambda n: isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)
    raw_sector = str(inputs.get('sector') or '').lower()
    sector = 'bank' if 'bank' in raw_sector else 'insurance' if 'insur' in raw_sector else 'investment' if any(s in raw_sector for s in ('investment', 'reit')) else 'general'
    specs = {
        'value': [('pe', 30, 5, .4), ('pb', 6, .5, .3), ('evEbitda', 20, 4, .3)],
        'growth': [('revenueGrowthYoy', -.1, .3, .4), ('epsGrowthYoy', -.2, .4, .4), ('fiveYearRevenueCagr', -.05, .2, .2)],
        'health': [('currentRatio', .5, 2.5, .35), ('debtToEquity', 2, 0, .4), ('interestCoverage', 1, 10, .25)],
        'income': [('dividendYield', 0, .08, .4), ('payoutRatio', 1.1, .4, .6)],
        'risk': [('volatility90d', .6, .15, .6), ('debtToEquity', 2.5, 0, .4)],
        'quality': [('roe', 0, .3, .35), ('roa', 0, .15, .25), ('netMargin', 0, .3, .4)],
        'momentum': [('priceMomentum3m', -.2, .3, 1)],
    }
    weights = dict(value=.2, growth=.15, health=.2, income=.1, risk=.15, quality=.15, momentum=.05)
    if r.get('dividendYield') == 0:
        specs['income'] = [('dividendYield', 0, .08, 1)]
    if sector in ('bank', 'insurance'):
        specs['value'] = [('pe', 25, 5, .5), ('pb', 3, .5, .5)]
        specs['risk'] = [('volatility90d', .6, .15, 1)]
        specs['health'] = [('nplRatio', .2, .02, .4), ('totalCapitalRatio', .1, .2, .4), ('coreCapitalRatio', .08, .16, .2)] if sector == 'bank' else [('solvencyCoverage', 1, 2, .6), ('combinedRatio', 1.2, .85, .4)]
        specs['quality'] = [('roe', 0, .25, .7), ('roa', 0, .03, .3)] if sector == 'bank' else [('roe', 0, .25, .5), ('roa', 0, .05, .2), ('underwritingMargin', -.1, .15, .3)]
        weights.update(value=.25, risk=.1)
    elif sector == 'investment':
        specs['value'] = [('pb', 2.5, .5, 1)]
        specs['quality'] = [('roe', 0, .2, 1)]
        weights = dict(value=.3, growth=.05, health=.1, income=.2, risk=.2, quality=.1, momentum=.05)
    scores, pillars, seen = {}, {}, {}
    for name, spec in specs.items():
        parts, missing, observations, coverage = [], [], [], 0
        data = inputs if name == 'growth' else r
        for field, worst, best, weight in spec:
            value = data.get(field)
            valid = finite(value) and (field not in ('pe', 'pb', 'evEbitda') or value > 0)
            valid = valid and (field not in ('currentRatio', 'debtToEquity', 'dividendYield', 'payoutRatio', 'volatility90d', 'nplRatio', 'totalCapitalRatio', 'coreCapitalRatio', 'solvencyCoverage', 'combinedRatio') or value >= 0)
            seen[field] = value if finite(value) else None
            if not valid:
                missing.append(field)
                continue
            bounded = min(max(value, min(worst, best)), max(worst, best))
            normalized = (bounded - worst) / (best - worst) * 100
            parts.append((normalized, weight)); coverage += weight
            observations.append(dict(metric=field, value=value, score=round(normalized, 2), weight=weight, worst=worst, best=best))
        score = math.floor(sum(s*w for s, w in parts)/coverage*10+.5)/10 if coverage else None
        scores[name] = score
        pillars[name] = dict(score=score, coverage=round(coverage, 4), missing=missing, observations=observations, weight=weights[name])
    coverage = sum(weights[k]*pillars[k]['coverage'] for k in weights)
    observed_weight = sum(weights[k] for k in weights if scores[k] is not None)
    eligible = coverage >= .6 and sum(v is not None for v in scores.values()) >= 4 and all(scores[k] is not None for k in ('value', 'health', 'quality'))
    overall = math.floor(sum(scores[k]*weights[k] for k in weights if scores[k] is not None)/observed_weight+.5) if eligible else None
    limited = inputs.get('basis') == 'publisher_observation' or inputs.get('filingDateKnown') is False
    confidence = 'insufficient' if not eligible else 'limited' if limited or coverage < .8 else 'supported'
    metadata = dict(methodologyVersion='continua-c-score-v2', displayName='C score', sectorProfile=sector,
        coveragePercent=round(coverage*100, 1), confidence=confidence, pillars=pillars,
        status='observed' if eligible else 'insufficient_evidence',
        reason=None if eligible else 'Requires at least 60% applicable metric coverage, four observed pillars and observed valuation, financial strength and quality. Missing inputs are not neutral scores.',
        basis=inputs.get('basis'), sourceUrls=inputs.get('sourceUrls') or [], fiscalYear=inputs.get('fiscalYear'),
        filingDateKnown=inputs.get('filingDateKnown'), filingDate=inputs.get('filingDate'), financialPeriodEnd=inputs.get('financialPeriodEnd'), priceAsOf=inputs.get('priceAsOf'), calculatedAt=inputs.get('calculatedAt'),
        interpretation='Custom bounded factor assessment of observed inputs, not a probability, return forecast, fair-value star rating or Morningstar methodology. Coverage measures evidence, not investment quality. Thresholds are disclosed research assumptions, not validated predictive accuracy.')
    return dict(securityId=security_id, afriScore=overall,
        **{'afri'+k.capitalize():v for k,v in scores.items()},
        inputs={**seen, **metadata})


def value_rating(valuation, now):
    """Model agreement is evidence coverage, not a probability of investment success."""
    finite = lambda n: isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)
    positive = lambda n: finite(n) and n > 0
    price = valuation.get('currentPrice') if positive(valuation.get('currentPrice')) else None
    models = [m for m in valuation.get('models', []) if positive(m.get('fairValue')) and positive(m.get('currentPrice')) and price and abs(m['currentPrice']/price-1) <= .01]
    values = sorted(m['fairValue'] for m in models)
    fair = (values[(len(values)-1)//2]+values[len(values)//2])/2 if values else None
    low, high = (min(values), max(values)) if values else (None, None)
    spread = (high-low)/fair if fair else None
    agreement = 'Limited' if len(models) < 2 else 'Wide' if spread > .5 else 'Mixed' if spread > .2 else 'Close'
    bands = [10, 30] if agreement == 'Close' else [20, 50] if agreement == 'Mixed' else [30, 75]
    upside = (fair/price-1)*100 if fair and price else None
    try:
        parse = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(datetime.timezone.utc)
        age = (parse(now)-parse(valuation.get('priceAsOf', ''))).total_seconds()/86400
        fresh = 0 <= age <= 7
    except (ValueError, TypeError, AttributeError):
        fresh = False
    reason = 'A positive observed price is required.' if not price else 'A dated quote no older than seven days is required.' if not fresh else 'At least two usable models with matching prices are required.' if len(models) < 2 else 'Model disagreement exceeds 50%; a star rating is withheld.' if spread > .5 else None
    b = round(upside, 8) if upside is not None else None
    stars = None if reason else 5 if b >= bands[1] else 4 if b >= bands[0] else 1 if b <= -bands[1] else 2 if b <= -bands[0] else 3
    return dict(methodologyVersion='continua-value-rating-v3', price=price, fair=fair, low=low, high=high,
                spread=spread, agreement=agreement, bands=bands, upside=upside, stars=stars, models=models,
                excluded=len(valuation.get('models', []))-len(models), unavailableReason=reason,
                priceAsOf=valuation.get('priceAsOf'), calculatedAt=now,
                methodology='Median of positive model fair values at matching prices. Stars require two models, a quote no older than seven days and model spread no greater than 50% of the median. Close agreement uses 10/30% upside bands; mixed uses 20/50%. These are disclosed screening assumptions, not calibrated probabilities or a Morningstar rating.')


def calculate(operation, a):
    if operation == 'stock_risk':
        from continua_risk import stock_risk
        return stock_risk(*a)
    if operation in ('risk_intelligence', 'risk_simulation'):
        from continua_risk import build_risk_intelligence, simulate_risk
        return build_risk_intelligence(*a) if operation == 'risk_intelligence' else simulate_risk(*a)
    if operation == 'value_rating':
        return value_rating(*a)
    if operation == 'cscore':
        return c_score(*a)
    if operation == "stress":
        positions, market, sectors = a
        total = sum(p["value"] for p in positions)
        contributions = []
        for p in positions:
            shock = (1 + market) * (1 + sectors.get(p["sector"], 0)) - 1
            contributions.append(dict(p, shock=shock, pnl=p["value"] * shock,
                                      stressedValue=p["value"] * (1 + shock)))
        pnl = sum(p["pnl"] for p in contributions)
        return dict(totalValue=total, pnl=pnl, stressedValue=total+pnl,
                    returnPercent=pnl/total*100 if total > 0 else None,
                    contributions=contributions,
                    assumptions=dict(marketShock=market, sectorShocks=sectors),
                    methodology="One-step market and sector price shocks compound multiplicatively. Current positions only; no inferred beta, trading, tax, liquidity costs or probabilities.")
    if operation == "futures":
        p = a[0]
        direction = 1 if p["side"] == "long" else -1
        quantity = p["multiplier"] * p["contracts"]
        pnl = (p["settlement"]-p["entry"]) * quantity * direction
        stress = p["settlement"] * p["shockPercent"]/100 * quantity * direction
        return dict(notional=p["settlement"]*quantity, pnl=pnl, stressPnl=stress,
                    marginBalance=p["margin"]+pnl, stressedMarginBalance=p["margin"]+pnl+stress,
                    effectiveLeverage=p["settlement"]*quantity/p["margin"] if p["margin"] > 0 else None,
                    expired=p["expiry"] < p["asOf"],
                    basis="User-entered contract multiplier, settlement, expiry and margin. Linear futures only. Margin is collateral, not the maximum loss. No options pricing, exchange margin simulation, trade execution or verified contract feed.")
    if operation == "bond":
        p = a[0]
        date = lambda d: datetime.datetime.fromisoformat(d.replace("Z", "+00:00"))
        t = lambda d: (date(d)-date(p["settlement"])).total_seconds()/86400/365
        y, m = p["yieldPercent"]/100, p["frequency"]
        price = lambda rate: sum(f["amount"]/(1+rate/m)**(m*t(f["date"])) for f in p["cashFlows"])
        dirty, step = price(y), 0.0001
        up, down = price(y+step), price(y-step)
        elapsed = (date(p["settlement"])-date(p["previousCoupon"])).total_seconds()
        period = (date(p["nextCoupon"])-date(p["previousCoupon"])).total_seconds()
        accrued = p["couponPerPeriod"]*elapsed/period
        duration = (down-up)/(2*dirty*step)
        convexity = (down+up-2*dirty)/(dirty*step*step)
        shock = p["shockBps"]/10000
        stressed = price(y+shock)
        return dict(dirtyPrice=dirty, accruedInterest=accrued, cleanPrice=dirty-accrued,
                    modifiedDuration=duration, convexity=convexity, dv01=dirty*duration/10000,
                    stressedDirtyPrice=stressed, pnl=stressed-dirty,
                    approximatePnl=dirty*(-duration*shock+0.5*convexity*shock*shock),
                    cashFlows=[dict(f, presentValue=f["amount"]/(1+y/m)**(m*t(f["date"]))) for f in p["cashFlows"]],
                    basis="User-supplied cash flows per chosen face amount. ACT/365 discount times with nominal yield compounded at the selected frequency; actual/actual coupon-period accrual. Not CBK settlement pricing, tax, transaction fees or an interpolated market curve.")
    if operation == "earnings":
        eps, price, years, growth, pe = a
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in a) or eps <= 0 or price <= 0 or int(years) != years or not 1 <= years <= 10 or not -80 <= growth <= 100 or not 1 <= pe <= 100:
            raise ValueError("invalid_assumptions")
        cells = []
        for g in [growth-10, growth, growth+10]:
            if not -90 <= g <= 110:
                continue
            for multiple in [pe*.75, pe, pe*1.25]:
                projected = eps*(1+g/100)**years
                illustrative = projected*multiple
                cells.append(dict(growthPercent=g, exitPe=multiple, projectedEps=projected,
                                  illustrativePrice=illustrative, changePercent=(illustrative/price-1)*100,
                                  annualizedPriceReturnPercent=((illustrative/price)**(1/years)-1)*100))
        return dict(cells=cells, breakEvenGrowthPercent=((price/(eps*pe))**(1/years)-1)*100,
                    assumptions=dict(eps=eps, currentPrice=price, years=years, growthPercent=growth, exitPe=pe),
                    methodology="Hypothetical EPS × exit P/E sensitivity, not a forecast, fair-value estimate or analyst target. EPS compounds at each entered growth rate with unchanged share basis. Dividends, dilution, fees and taxes are excluded. No probabilities are assigned. Break-even growth only recovers the entered price before those exclusions.")
    raise ValueError("unsupported_operation")


if __name__ == "__main__":
    try:
        payload = sys.stdin.buffer.read(2097153)
        if len(payload) > 2097152:
            raise ValueError("input_limit")
        request = json.loads(payload, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonfinite")))
        print(json.dumps(calculate(request["operation"], request["args"]), allow_nan=False))
    except Exception:
        print("Engine calculation rejected", file=sys.stderr)
        sys.exit(1)
