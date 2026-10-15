"""Deterministic research observations. Never substitute missing data or forecast prices."""
from decimal import Decimal, ROUND_HALF_UP, localcontext
import math
from .numbers import finite, compatible_currency


def fixed(value, places=1):
    # Preserve the source's toFixed on the actual binary float, not on its
    # decimal spelling. Python's ordinary format uses a different tie rule.
    value = float(value)
    if not math.isfinite(value):
        return 'NaN' if math.isnan(value) else 'Infinity' if value > 0 else '-Infinity'
    if abs(value) >= 1e21:
        return str(value).replace('e+0', 'e+').replace('e-0', 'e-')
    with localcontext() as context:
        context.prec = 330
        result = Decimal.from_float(value).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
        if value == 0:
            result = abs(result)
        return format(result, f'.{places}f')


def fixed1(value):
    return fixed(value, 1)


def company_briefing(input):
    latest, prior, ratios = input.get('latest'), input.get('prior'), input.get('ratios') or {}
    strengths, risks, facts = [], [], []
    if latest and prior and latest.get('fiscalYear') == prior.get('fiscalYear', 0) + 1 and compatible_currency(latest.get('currency'),prior.get('currency')):
        for key, label in [('revenue', 'Revenue'), ('netIncome', 'Net income'), ('eps', 'EPS')]:
            current, previous = latest.get(key), prior.get(key)
            if not finite(current) or not finite(previous) or previous == 0:
                continue
            change = (current - previous) / abs(previous) * 100
            fact = f"{label} {'increased' if change >= 0 else 'decreased'} {fixed1(abs(change))}% in FY{latest['fiscalYear']} versus FY{prior['fiscalYear']}."
            facts.append(fact)
            (strengths if change >= 0 else risks).append(fact)
    for key, label in [('roe', 'Reported return on equity is'), ('netMargin', 'Net margin is')]:
        if finite(ratios.get(key)):
            facts.append(f"{label} {fixed1(ratios[key] * 100)}%.")
    if finite(ratios.get('debtToEquity')):
        fact = f"Debt is {fixed1(ratios['debtToEquity'] * 100)}% of shareholder equity."
        facts.append(fact)
        if ratios['debtToEquity'] > 1:
            risks.append(fact)
    if finite(ratios.get('dividendYield')):
        facts.append(f"Trailing dividend yield is {fixed1(ratios['dividendYield'] * 100)}%.")
    if latest and finite(latest.get('netIncome')) and latest['netIncome'] < 0:
        risks.append('The latest annual period records a net loss.')
    return {
        'title': f"{input['symbol']} fundamental briefing",
        'methodology': 'Calculated from reported annual statements and current ratios. Growth comparisons require consecutive fiscal years.',
        'facts': facts, 'strengths': strengths, 'risks': risks,
        'coverage': f"Latest annual period: FY{latest['fiscalYear']}" if latest else 'Annual financial statements are not on file yet.',
    }


def research_synthesis(price, signals, risks, unavailable):
    observations = []
    def signal(kind):
        return next((item for item in signals if item.get('type') == kind), None)
    def add(topic, text, item):
        dates = item.get('timestamps') or []
        observations.append({'topic': topic, 'text': text, 'asOf': dates[-1] if dates else None})
    rsi, average, momentum = signal('RSI'), signal('SMA'), signal('MACD')
    if rsi and finite(rsi.get('latest')):
        value = rsi['latest']
        text = ('RSI is at or above 70: elevated momentum can persist, so this alone is not a reversal signal.' if value >= 70 else
                'RSI is at or below 30: weak momentum can persist, so this alone is not a recovery signal.' if value <= 30 else
                'RSI is between 30 and 70, outside the conventional extreme bands.')
        add('Momentum', text, rsi)
    if average and finite(average.get('latest')) and finite(price) and price > 0:
        direction = 'above' if price >= average['latest'] else 'below'
        add('Price trend', f'Latest quote is {direction} the 20-session moving average. Quote and daily-candle timestamps can differ.', average)
    if momentum and isinstance(momentum.get('latest'), dict) and finite(momentum['latest'].get('histogram')):
        direction = 'non-negative' if momentum['latest']['histogram'] >= 0 else 'negative'
        add('Trend confirmation', f'MACD histogram is {direction}; compare this momentum reading with the company’s reported performance.', momentum)
    checklist = [{'topic': 'Fundamental risk', 'text': text, 'asOf': None} for text in risks]
    checklist += [{'topic': 'Data coverage', 'text': name + ' could not be loaded; the analysis is incomplete.', 'asOf': None} for name in unavailable]
    return {'observations': observations, 'checklist': checklist,
            'methodology': 'Rule-based synthesis of reported fundamentals and SMA(20), RSI(14), MACD(12,26,9). Signals are observations, not trade recommendations or price forecasts.'}
