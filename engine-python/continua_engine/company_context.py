"""Automatic cross-statement observations. Never substitutes for dated filings.

Newest category revisions are supplied first by the gated database reader.
Ratios use matching annual periods; absent inputs and conflicts remain unknown.
"""
from decimal import Decimal
import math


def company_context(observations):
    periods, categories, priorities, conflicts = {}, set(), {}, set()
    for observation in observations:
        if observation.get('status') != 'publisher_observation': continue
        category = observation.get('category')
        if category:
            if category in categories: continue
            categories.add(category)
        priority = 2 if observation.get('destination') == 'financials' else 1
        for field in observation.get('financialFields', []):
            year, metric, value = field.get('year'), field.get('metric'), field.get('value')
            if type(year) is not int or not isinstance(metric, str) or type(value) not in (int, float) or not math.isfinite(value): continue
            identity = (year, metric)
            if priorities.get(identity, 0) > priority: continue
            period = periods.setdefault(year, {'fiscalYear': year})
            if priorities.get(identity, 0) < priority:
                period.pop(metric, None)
                conflicts.discard(identity)
                priorities[identity] = priority
            if metric in period and period[metric] != value: conflicts.add(identity)
            period[metric] = value
    for year, metric in conflicts: periods[year][metric] = None
    history = [periods[y] for y in sorted(periods)]
    for period in history:
        ratios = {}
        for name, numerator, denominator in (
            ('netMargin', 'netIncome', 'revenue'), ('grossMargin', 'grossProfit', 'revenue'),
            ('operatingMargin', 'operatingIncome', 'revenue'), ('roe', 'netIncome', 'totalEquity'),
            ('roa', 'netIncome', 'totalAssets'), ('currentRatio', 'currentAssets', 'currentLiabilities'),
            ('debtToEquity', 'totalDebt', 'totalEquity')):
            n, d = period.get(numerator), period.get(denominator)
            ratios[name] = float(Decimal(str(n))/Decimal(str(d))) if n is not None and d is not None and d > 0 else None
        period['ratios'] = ratios
    return {'version': 1, 'basis': 'publisher_observation', 'history': history,
            'latest': history[-1] if history else None,
            'limitations': ['Disclosure dates, adjustment basis, analyst estimates and missing accounting inputs are not inferred.']}
