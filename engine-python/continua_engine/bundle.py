"""Native company research assembly from supplied, dated backend inputs only."""
from .analytics import analyze_financials, data_quality, scenarios
from .briefing import company_briefing, research_synthesis
from .research_components import afri_score, company_diagnostics, summarize_news
from .readiness import research_readiness
from .reported import reported_research_ratios
from .dividends import trailing_dividend_per_share
from .ratios import yoy_growth
from .numbers import finite, compatible_currency


def assemble_company_bundle(input, now):
    profile, symbol, exchange = input['profile'], input['symbol'], input['exchange']
    quote = input.get('quote')
    history = sorted(input.get('history') or [], key=lambda row: row['fiscalYear'])
    earnings, ownership, actions = input.get('earnings') or [], input.get('ownership') or [], input.get('actions') or []
    valuation, unavailable = input.get('valuation'), list(input.get('unavailable') or [])
    technicals = [item for item in input.get('technicals') or [] if item is not None]
    news, articles = input.get('news') or [], input.get('articles') or {}
    digest = []
    for item in [item for item in news if not item.get('needsReview')][:6]:
        article = articles.get(str(item['id'])) or {}
        digest.append({'id': item['id'], 'headline': item['headline'], **summarize_news(item['headline'], article.get('content'), item.get('excerpt')),
                       'source': item.get('sourceName'), 'url': item.get('articleUrl'), 'publishedAt': item.get('publishedAt'), 'impact': item.get('impact')})
    latest = history[-1] if history else None
    prior = history[-2] if len(history) > 1 else None
    dps_at_quote = trailing_dividend_per_share(actions, quote['timestamp']) if quote else None
    ratios = reported_research_ratios(profile['id'], quote, history, dps_at_quote, now)
    adjacent = latest is not None and prior is not None and latest['fiscalYear'] == prior['fiscalYear'] + 1 and compatible_currency(latest.get('currency'),prior.get('currency')) and compatible_currency(latest.get('currency'),quote.get('currency') if quote else None)
    score = None
    if ratios is not None:
        score = afri_score(profile['id'], {'ratios': ratios, 'revenueGrowthYoy': yoy_growth(latest.get('revenue'), prior.get('revenue')) if adjacent else None,
                                         'epsGrowthYoy': yoy_growth(latest.get('eps'), prior.get('eps')) if adjacent else None})
        score['asOf'] = quote['timestamp']
    company = profile['company']
    financial_analysis = analyze_financials(history, company.get('sectorName') or '')
    models = valuation.get('models') or [] if valuation else []
    # Backend supplies ICU-collated names when constructing this snapshot.
    # Display ownership order remains the actual disclosed-percent order.
    state_ownership = input.get('stateOwnership')
    if state_ownership is None:
        state_ownership = sorted([{'name': h['holderName'], 'percent': h['percentHeld']} for h in ownership], key=lambda h: h['name'])
    state = {'fiscalYear': latest.get('fiscalYear') if latest else None, 'revenue': latest.get('revenue') if latest else None,
             'netIncome': latest.get('netIncome') if latest else None, 'debtToEquity': financial_analysis['metrics']['debtToEquity'],
             'fairValue': next((m['fairValue'] for m in models if m.get('fairValue') is not None), None),
             'newsIds': sorted([item['id'] for item in digest]), 'ownership': state_ownership}
    dps = trailing_dividend_per_share(actions, now)
    dividend_analysis = {'trailingDps': dps, 'payoutRatio': dps / latest['eps'] if latest and finite(latest.get('eps')) and latest['eps'] > 0 and dps is not None else None,
                         'coverage': latest['freeCashFlow'] / latest['netIncome'] if latest and finite(latest.get('netIncome')) and latest['netIncome'] > 0 and finite(latest.get('freeCashFlow')) else None,
                         'events': [a for a in actions if a['details'].get('type') == 'dividend' and a.get('status') != 'cancelled']}
    briefing = company_briefing({'symbol': symbol, 'latest': latest, 'prior': prior, 'ratios': ratios})
    estimates = [e for e in earnings if e.get('epsEstimate') is not None or e.get('revenueEstimate') is not None]
    unique_unavailable = list(dict.fromkeys(unavailable))
    bundle = {
        'refresh': {'state': 'partial' if unavailable else 'complete', 'failedSections': unique_unavailable, 'attemptedAt': now},
        'reliability': research_readiness({'quote': quote, 'history': history, 'unavailable': unavailable,
                                         'technicalObservations': min(len(t['timestamps']) for t in technicals) if technicals else 0,
                                         'estimateCount': len(estimates), 'ownershipCount': len(ownership)}, now),
        'diagnostics': company_diagnostics(history), 'quality': data_quality(quote, history, now), 'financialAnalysis': financial_analysis,
        'changes': {'baseline': True, 'changes': [], 'fingerprint': '', 'comparedAsOf': None}, 'scenarios': scenarios(latest),
        'dividendAnalysis': dividend_analysis, 'quarterly': input.get('quarterly') or [], 'actions': actions, 'sector': company.get('sectorName'),
        'synthesis': research_synthesis(quote.get('lastPrice') if quote else None, technicals, briefing['risks'], unique_unavailable),
        'symbol': symbol, 'exchange': exchange, 'currency': profile['currency'], 'companyName': company['name'], 'unavailable': unavailable,
        'generatedAt': now, 'quote': quote, 'history': history, 'earnings': earnings, 'ownership': ownership, 'valuation': valuation,
        'ratios': ratios, 'score': score, 'news': digest, 'technicals': technicals, 'briefing': briefing, 'estimates': estimates,
        'coverage': {'annualPeriods': len(history), 'earningsEvents': len(earnings), 'shareholderDisclosures': len(ownership),
                     'valuationModels': sum(m.get('fairValue') is not None for m in models), 'analystEstimates': len(estimates),
                     'insiderTransactions': False, 'orderDepth': False, 'optionsData': False},
    }
    return {'bundle': bundle, 'state': state, 'observeEligible': not unavailable}
