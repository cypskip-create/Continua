"""Transparent compatibility research rules and source-only news extraction."""
import math
import re
from .numbers import finite

WEIGHTS = {'value': .20, 'growth': .15, 'health': .20, 'income': .10, 'risk': .15, 'quality': .15, 'momentum': .05}


def afri_score(security_id, inputs):
    ratios = inputs['ratios']
    def normalized(value, worst, best):
        if not finite(value): return None
        clamped = min(max(value, min(worst, best)), max(worst, best))
        return (clamped - worst) / (best - worst) * 100
    def weighted(parts):
        usable = [(score, weight) for score, weight in parts if score is not None]
        # Preserve the API's documented neutral rule, not a fabricated metric.
        # All absent raw inputs below stay null and readiness remains separate.
        if not usable: return 50
        value = sum(score * weight for score, weight in usable) / sum(weight for _, weight in usable)
        return math.floor(value * 10 + .5) / 10
    def parts(spec, data):
        return weighted([(normalized(data.get(field), worst, best), weight) for field, worst, best, weight in spec])
    scores = {
        'value': parts([('pe', 30, 5, .4), ('pb', 6, .5, .3), ('evEbitda', 20, 4, .3)], ratios),
        'growth': parts([('revenueGrowthYoy', -.1, .3, .4), ('epsGrowthYoy', -.2, .4, .4), ('fiveYearRevenueCagr', -.05, .2, .2)], inputs),
        'health': parts([('currentRatio', .5, 2.5, .35), ('debtToEquity', 2, 0, .4), ('interestCoverage', 1, 10, .25)], ratios),
        'income': parts([('dividendYield', 0, .1, .6), ('payoutRatio', 1.1, .4, .4)], ratios),
        'risk': parts([('volatility90d', .6, .15, .6), ('debtToEquity', 2.5, 0, .4)], ratios),
        'quality': parts([('roe', 0, .3, .35), ('roa', 0, .15, .25), ('netMargin', 0, .3, .4)], ratios),
        'momentum': parts([('priceMomentum3m', -.2, .3, 1)], ratios),
    }
    result = {'securityId': security_id, 'afriScore': math.floor(sum(scores[key] * WEIGHTS[key] for key in WEIGHTS) + .5)}
    result.update({'afri' + key.capitalize(): value for key, value in scores.items()})
    result['inputs'] = {key: ratios.get(key) for key in ['pe', 'pb', 'roe', 'debtToEquity', 'dividendYield', 'volatility90d']}
    result['inputs'].update({key: inputs.get(key) for key in ['revenueGrowthYoy', 'epsGrowthYoy']})
    return result


def company_diagnostics(history, sector=""):
    rows = sorted(history, key=lambda r: r['fiscalYear'])
    last = rows[-1] if rows else {}
    prior = next((row for row in rows if row['fiscalYear'] == last.get('fiscalYear', 0) - 1), {})
    def ratio(a, b): return a / b if finite(a) and finite(b) and b > 0 else None
    trends = []
    for r in rows:
        income, cash = r.get('netIncome'), r.get('operatingCashFlow')
        trends.append({'year': r['fiscalYear'], 'netMargin': ratio(income, r.get('revenue')), 'roe': ratio(income, r.get('totalEquity')),
                       'cashConversion': ratio(cash, income), 'accrualsToAssets': ratio(income - cash, r.get('totalAssets')) if finite(income) and finite(cash) else None,
                       'sourceUrls': r.get('sourceUrls') or [], 'reportedAt': r.get('reportedAt')})
    checks = []
    def add(id, label, value, reason): checks.append({'id': id, 'label': label, 'result': 'unknown' if value is None else 'pass' if value else 'flag', 'reason': reason})
    income, cash = last.get('netIncome'), last.get('operatingCashFlow')
    add('profit', 'Positive earnings', income > 0 if finite(income) else None, 'Latest reported annual net income; a loss is not automatically a bad investment.')
    add('cash', 'Operating cash supports profit', cash >= income if finite(cash) and finite(income) and income > 0 else None, 'Requires positive profit and reported operating cash flow from the same period.')
    lm, pm = ratio(income, last.get('revenue')), ratio(prior.get('netIncome'), prior.get('revenue'))
    add('margin', 'Net margin did not deteriorate', lm >= pm if lm is not None and pm is not None else None, 'Compares only the adjacent prior fiscal year, never a distant archived year.')
    ls, ps = last.get('sharesOutstanding'), prior.get('sharesOutstanding')
    add('dilution', 'Reported share count did not increase', ls <= ps if finite(ls) and finite(ps) and ps > 0 else None, 'Changes may be corporate actions, not issuance; review the share disclosures.')
    ld, pd = ratio(last.get('totalDebt'), last.get('totalEquity')), ratio(prior.get('totalDebt'), prior.get('totalEquity'))
    add('leverage', 'Debt/equity did not rise', ld <= pd if ld is not None and pd is not None else None, 'Generic debt/equity is not a bank regulatory-capital measure.')
    liquidity = ratio(last.get('currentAssets'), last.get('currentLiabilities'))
    add('liquidity', 'Current assets cover current liabilities', liquidity >= 1 if liquidity is not None else None, 'A simple reported liquidity check, not a sector-specific solvency judgment.')
    specs = {
        'profit': (['netIncome'], 'netIncome > 0'),
        'cash': (['operatingCashFlow','netIncome'], 'operatingCashFlow >= netIncome, with positive netIncome'),
        'margin': (['netIncome','revenue'], '(netIncome / revenue) >= prior annual (netIncome / revenue)'),
        'dilution': (['sharesOutstanding'], 'sharesOutstanding <= prior annual sharesOutstanding'),
        'leverage': (['totalDebt','totalEquity'], '(totalDebt / totalEquity) <= prior annual (totalDebt / totalEquity)'),
        'liquidity': (['currentAssets','currentLiabilities'], 'currentAssets / currentLiabilities >= 1'),
    }
    financial = bool(re.search(r'bank|insurance|financial', sector, re.I))
    for check in checks:
        fields, formula = specs[check['id']]
        comparison = check['id'] in ('margin','dilution','leverage')
        inputs = {key:last.get(key) for key in fields}
        if comparison:
            inputs.update({'prior.'+key:prior.get(key) for key in fields})
        check.update(inputs=inputs, formula=formula, fiscalYear=last.get('fiscalYear'),
                     currency=last.get('currency'), sourceUrls=last.get('sourceUrls') or [],
                     basis=last.get('basis') or 'reviewed_filing',
                     methodVersion='financial-evidence-v2',
                     missing=[key for key,value in inputs.items() if not finite(value)])
        if comparison and last.get('currency') and prior.get('currency') and last['currency']!=prior['currency']:
            check['result']='unknown'
            check['reason']='Different reporting currencies require a sourced conversion before comparing annual values.'
        if financial and check['id'] in ('cash','leverage','liquidity'):
            check['result']='not_applicable'
            check['reason']='Generic industrial cash-conversion, debt and current-ratio thresholds are not used for banks or insurers; regulatory capital, asset quality and sector disclosures are required.'
    evidence = []
    for r in rows:
        for field, value in r.items():
            if finite(value) and field not in ('fiscalYear', 'fiscalQuarter'):
                evidence.append({'year': r['fiscalYear'], 'field': field, 'value': value, 'periodEnd': r.get('periodEnd'), 'availableAt': r.get('reportedAt'), 'sourceUrls': r.get('sourceUrls') or [],
                                 'basis': 'Third-party mapped observation' if r.get('basis')=='publisher_observation' else 'Reviewed filing' if r.get('sourceUrls') else 'Stored figure without reviewed URL'})
    return {'trends': trends, 'checks': checks, 'knownChecks': sum(c['result'] in ('pass','flag') for c in checks), 'totalChecks': len(checks), 'evidence': evidence,
            'methodology': 'Reported-period diagnostics, not a proprietary rating, trading recommendation or probability of success. Missing inputs remain unknown. Source availability dates can be later than period ends.'}


def utf16_slice(value, limit):
    return value.encode('utf-16-le', errors='surrogatepass')[:limit * 2].decode('utf-16-le', errors='surrogatepass')


def summarize_news(headline, content=None, excerpt=None):
    text = re.sub(r'<[^>]*>', ' ', content or excerpt or '')
    text = utf16_slice(re.sub(r'\s+', ' ', text).strip(), 30000)
    sentences = [s.strip() for s in re.findall(r'[^.!?]+(?:[.!?](?=\s|$)|$)', text) if len(s.strip().encode('utf-16-le', errors='surrogatepass')) // 2 > 25]
    unique = [s for s in dict.fromkeys(sentences) if s.lower() != headline.lower()]
    ranked = [(s, i, 2 if re.search(r'\b(revenue|profit|earnings|dividend|debt|cash flow|regulator|acquisition|loss|forecast)\b', s, re.I) else 0) for i, s in enumerate(unique)]
    selected = sorted(sorted(ranked, key=lambda item: (-item[2], item[1]))[:3], key=lambda item: item[1])
    summary = ' '.join(s for s, _, _ in selected if len(s.encode('utf-16-le', errors='surrogatepass')) // 2 <= 500)
    summary = summary or utf16_slice((excerpt or '').strip(), 500) or headline
    return {'summary': summary, 'methodology': 'Extractive summary: up to three source sentences prioritized for financial relevance.' if content else 'Publisher excerpt or headline; full article text unavailable.', 'fullTextAvailable': bool(content and content.strip())}
