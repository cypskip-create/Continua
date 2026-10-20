"""Risk Intelligence v1: observed prices, sample covariance and manual scenarios.

Daily risk is authoritative. Annual risk is withheld without a verified exchange
session calendar. No expected returns, fabricated adjustments or trading writes.
"""
import math
from statistics import covariance, stdev, correlation
import datetime

def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def parse(value):
    if not isinstance(value,str):
        return None
    try:
        result=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
        return result.replace(tzinfo=datetime.timezone.utc) if result.tzinfo is None else result
    except ValueError:
        return None

def portfolio_analysis(positions):
    priced=[p for p in positions if finite(p.get("price")) and p["price"]>0 and finite(p.get("shares")) and p["shares"]>0]
    currencies={p.get("currency") for p in priced}
    coverage=f"{len(priced)}/{len(positions)}"
    if len(currencies)>1:
        return {"available":False,"reason":"Mixed currencies cannot be aggregated without dated FX rates.","positions":[],"sectors":[],"totalValue":0,"sessionPnl":None,"coverage":coverage,"warnings":["Currency conversion feed required."]}
    total=sum(p["shares"]*p["price"] for p in priced)
    rows=[dict(p,value=p["shares"]*p["price"],weight=p["shares"]*p["price"]/total if total>0 else 0,
               sessionContribution=p["shares"]*p["change"] if finite(p.get("change")) else None,
               participation=p["shares"]/p["volume"] if finite(p.get("volume")) and p["volume"]>0 else None) for p in priced]
    rows.sort(key=lambda p:p["value"],reverse=True)
    sectors={}
    for p in rows:
        sector=p.get("sector")
        sectors[sector]=sectors.get(sector,0)+p["value"]
    dates={p.get("asOf","")[:10] if p.get("asOf") else None for p in rows}
    same=len(dates)==1 and None not in dates
    warnings=[]
    if rows and not same:
        warnings.append("Quotes do not share a dated session; combined session contribution is unavailable.")
    if any(p["weight"]>.4 for p in rows):
        warnings.append("A priced position exceeds 40% of covered portfolio value.")
    if any(p["participation"] is not None and p["participation"]>.1 for p in rows):
        warnings.append("A holding exceeds 10% of its latest session volume. This is a rough liquidity observation, not a liquidation forecast.")
    if len(priced)!=len(positions):
        warnings.append("Unpriced holdings are excluded; weights and contributions describe covered positions only.")
    return {"available":True,"reason":None,"positions":rows,"sectors":[{"sector":sector,"value":value,"weight":value/total if total else 0} for sector,value in sectors.items()],"totalValue":total,
            "sessionPnl":sum(p["sessionContribution"] for p in rows) if same and rows and all(p["sessionContribution"] is not None for p in rows) else None,"coverage":coverage,"warnings":warnings}

def daily_close_map(bars):
    valid=[b for b in bars if finite(b.get("close")) and b["close"]>0 and parse(b.get("timestamp"))]
    valid.sort(key=lambda b:parse(b["timestamp"]))
    return {b["timestamp"][:10]:b["close"] for b in valid}

def _drawdown(v):
    peak,worst=v[0],0
    for x in v:
        peak=max(peak,x)
        worst=min(worst,x/peak-1)
    return worst*100

def _curve(returns):
    v=[100]
    for r in returns:
        v.append(v[-1]*(1+r))
    return v


VERSION = 'continua-risk-v1'
MINIMUM = 20


def stock_risk(bundle, bars, actions, now):
    quote = bundle.get('quote') or {}
    symbol = bundle['symbol']
    start = (parse(now)-datetime.timedelta(days=365)).date().isoformat()
    blocked = any(a.get('type') in ('split','bonus_issue') and a.get('status') != 'cancelled'
                  and (a.get('effectiveDate') or a.get('exDate') or '') >= start for a in actions)
    position = dict(symbol=symbol,shares=1,price=quote.get('lastPrice') if quote.get('source') != 'mock' else None,cost=0,
                    currency=quote.get('currency') or bundle.get('currency'),sector=bundle.get('sector') or 'Unclassified',
                    asOf=quote.get('timestamp'),volume=quote.get('volume'),change=quote.get('change'))
    snapshot=build_risk_intelligence([position],[dict(symbol=symbol,bars=bars,blocked=blocked)],now)
    snapshot['stockDiagnostic']=True
    snapshot['evidence']['performanceBasis']='Single-stock price history with unit exposure for diagnostics, not an owned holding or realized account return.'
    snapshot['legacyRisk']['reason']=snapshot['evidence']['performanceBasis']+' '+snapshot['evidence']['annualizationReason']
    return snapshot


def _returns(bars, now):
    valid = [b for b in bars if parse(b.get('timestamp')) and parse(b['timestamp']) <= parse(now)]
    closes = daily_close_map(valid)
    dates = sorted(closes)
    # A return must refer to the same two observed dates in every comparison.
    values = {(before, after): closes[after]/closes[before]-1
              for before, after in zip(dates, dates[1:])
              if (parse(after)-parse(before)).days <= 4}
    return closes, values


def build_risk_intelligence(positions, histories, now, minimum=MINIMUM):
    if type(minimum) is not int or not 20 <= minimum <= 250:
        raise ValueError('Use 20–250 minimum observations')
    current = parse(now)
    if current is None:
        raise ValueError('A calculation timestamp is required')
    analysis = portfolio_analysis(positions)
    rows = analysis['positions'] if analysis['available'] else []
    history = {h['symbol']: h for h in histories}
    prepared, returns, sources, coverage = {}, {}, set(), []
    for p in positions:
        symbol = p['symbol']; h = history.get(symbol, {})
        closes, r = _returns(h.get('bars', []), now)
        quote = parse(p.get('asOf'))
        stale = quote is None or (current-quote).days > 7 or quote > current
        reason = ('Unpriced or unsupported position' if not any(q['symbol'] == symbol for q in rows)
                  else 'Corporate action adjustment unverified' if h.get('blocked')
                  else 'Stale or undated quote/history' if stale or not closes or (current-parse(max(closes))).days > 7
                  else 'Insufficient observations' if len(r) < minimum else None)
        coverage.append({'symbol':symbol, 'included':reason is None, 'reason':reason,
                         'observations':len(r), 'priceAsOf':p.get('asOf'),
                         'lastHistoryDate':max(closes) if closes else None,
                         'unchangedFraction':sum(v == 0 for v in r.values())/len(r) if r else None,
                         'latestVolume':p.get('volume'), 'sector':p.get('sector') or 'Unclassified'})
        sources.update(url for url in h.get('sourceUrls',[]) if isinstance(url,str))
        sources.update(b['sourceUrl'] for b in h.get('bars', []) if isinstance(b.get('sourceUrl'),str))
        if reason is None:
            prepared[symbol], returns[symbol] = closes, r
    symbols = list(prepared)
    intervals = sorted(set.intersection(*(set(returns[s]) for s in symbols))) if symbols else []
    common_dates=set.intersection(*(set(prepared[s]) for s in symbols)) if symbols else set()
    excluded_intervals=max(0,len(common_dates)-1-len(intervals))
    eligible = len(intervals) >= max(minimum, len(symbols)+2)
    vectors = {s:[returns[s][d] for d in intervals] for s in symbols}
    matrix = [[covariance(vectors[a],vectors[b]) for b in symbols] for a in symbols] if eligible else None
    by_symbol = {p['symbol']:p for p in rows}
    covered_value = sum(by_symbol[s]['value'] for s in symbols)
    weights = [by_symbol[s]['value']/covered_value for s in symbols] if covered_value else []
    pairs = []
    for i,a in enumerate(symbols):
        for b in symbols[i+1:]:
            common = sorted(returns[a].keys() & returns[b].keys())
            x,y = [returns[a][d] for d in common],[returns[b][d] for d in common]
            supported = len(x) >= minimum and max(x) > min(x) and max(y) > min(y)
            rolling = []
            if supported and len(x) >= 60:
                for end in range(60,len(x)+1,20):
                    xx,yy = x[end-60:end],y[end-60:end]
                    rolling.append({'date':common[end-1][1], 'correlation':correlation(xx,yy) if max(xx)>min(xx) and max(yy)>min(yy) else None, 'observations':60})
            pairs.append({'a':a,'b':b,'correlation':correlation(x,y) if supported else None,
                          'observations':len(x),'start':common[0][0] if common else None,
                          'end':common[-1][1] if common else None,'rolling':rolling})
    basket = [sum(weights[j]*vectors[s][i] for j,s in enumerate(symbols)) for i in range(len(intervals))] if eligible else []
    contribution = _contributions(symbols, matrix, weights, by_symbol)
    dated = {p.get('asOf','')[:10] if p.get('asOf') else None for p in rows}
    evidence = {'methodologyVersion':VERSION,'calculatedAt':now,'portfolioSnapshotDate':now,
                'marketDataAsOf':min((p['asOf'] for p in rows if p.get('asOf')), default=None),
                'valuationDates':sorted(d for d in dated if d),'synchronizedValuation':len(dated)==1 and None not in dated,
                'sampleStart':intervals[0][0] if intervals else None,'sampleEnd':intervals[-1][1] if intervals else None,
                'observations':len(intervals),'excludedIntervals':excluded_intervals,'minimumObservations':minimum,'sources':sorted(sources),
                'quality':'insufficient_observations' if not eligible else 'partial_coverage' if any(not c['included'] or (c['unchangedFraction'] or 0)>.5 for c in coverage) else 'sufficient_coverage',
                'returnConvention':'Simple price returns on identical observed consecutive-date intervals, at most four calendar days apart; sample covariance (n−1).',
                'annualizationFactor':None,'annualizationReason':'Verified NSE trading-session calendar unavailable. Daily volatility is shown; annual volatility is withheld.',
                'performanceBasis':'Constant-weight daily-rebalanced current-holdings simulation, not realized portfolio performance.',
                'limitations':['Raw price returns exclude dividends. Known unverified splits/bonus issues are excluded.',
                               'No forward fill or missing-as-zero returns. Suspensions and incomplete action history may remain unidentified.',
                               'Repeated closes and thin trading can understate economic risk; low observed volatility is not low investment risk.',
                               'Pairwise correlations use their own overlaps; covariance uses one common sample. Historical relationships can change.',
                               'Covered value excludes missing prices and cash; quote dates can differ. Synchronized valuation requires one dated session.',
                               'Volatility and drawdown describe the eligible historical sleeve, renormalized to its covered value; excluded holdings are not zero risk.']}
    replays = []
    if eligible and len(symbols)==len(rows) and len(intervals)>=20:
        windows = []
        for end in range(20,len(intervals)+1):
            window=intervals[end-20:end]
            if any(window[i][0]!=window[i-1][1] for i in range(1,len(window))):
                continue
            shocks={s:math.prod(1+v for v in vectors[s][end-20:end])-1 for s in symbols}
            windows.append({'id':window[0][0]+':'+window[-1][1], 'start':window[0][0],
                            'end':window[-1][1], 'holdingShocks':shocks,
                            'observations':20,'coveredReturn':sum(weights[i]*shocks[s] for i,s in enumerate(symbols))})
        if windows:
            for item in [min(windows,key=lambda w:w['coveredReturn']),windows[-1]]:
                if not any(r['id']==item['id'] for r in replays):replays.append(item)
    stock = []
    for s in symbols:
        r = list(returns[s].values()); downside = [min(v,0) for v in r]
        stock.append({'symbol':s,'dailyVolatility':stdev(r)*100,'maxDrawdown':_drawdown(_curve(r)),
                      'downsideDeviation':math.sqrt(sum(v*v for v in downside)/len(r))*100,
                      'observations':len(r),'benchmarkBeta':None,
                      'benchmarkReason':'Verified matching NSE benchmark history unavailable; holdings basket is not an index.'})
    legacy_attribution = None
    if contribution['dailyVolatility'] and basket:
        ordered=sorted(basket);tail_count=math.ceil(len(ordered)*.05)
        variance=(contribution['dailyVolatility']/100)**2
        legacy_attribution={'coveredWeight':covered_value/analysis['totalValue'] if analysis['totalValue'] else 0,
                            'observations':len(intervals),'contributions':[{'symbol':p['symbol'],'weight':p['weight'],
                            'varianceContribution':p['riskPercent']/100*variance,'riskShare':p['riskPercent']/100} for p in contribution['contributions']],
                            'historicalVaR95':max(0,-ordered[tail_count-1])*100 if len(ordered)>=60 else None,
                            'expectedShortfall95':max(0,-sum(ordered[:tail_count])/tail_count)*100 if len(ordered)>=60 else None,
                            'tailObservations':tail_count if len(ordered)>=60 else 0,
                            'methodology':evidence['returnConvention']+' Historical one-day 95% tails require 60 returns and are not forecasts.'}
    proxy=[sum(vectors[s][i] for s in symbols)/len(symbols) for i in range(len(intervals))] if eligible else []
    legacy={'available':eligible,'reason':evidence['performanceBasis']+' '+evidence['annualizationReason']+' Beta uses an equal-weight holdings basket, not an NSE benchmark.',
            'symbols':symbols,'observations':len(intervals),'excludedIntervals':excluded_intervals,
            'coveredWeight':covered_value/analysis['totalValue'] if analysis['totalValue'] else 0,
            'metrics':{'attribution':legacy_attribution,'portfolioVolatility':None,'marketVolatility':None,
                       'dailyPortfolioVolatility':contribution['dailyVolatility'],
                       'portfolioMaxDrawdown':_drawdown(_curve(basket)),
                       'portfolioBeta':covariance(basket,proxy)/covariance(proxy,proxy) if stdev(proxy)>0 else None,
                       'sharpe':None,'sortino':None,'volatilityByHolding':[{'symbol':s,'volatility':None} for s in symbols],
                       'drawdownByHolding':[{'symbol':s,'drawdown':_drawdown(_curve(vectors[s]))} for s in symbols]} if eligible else None}
    return {'version':VERSION,'legacyRisk':legacy,'overview':{'coveredValue':analysis['totalValue'],'riskCoveredValue':covered_value,
             'accountValue':None,'largestWeight':max((p['weight'] for p in rows),default=None),
             'topFiveWeight':sum(p['weight'] for p in rows[:5]),'sectors':analysis['sectors'],
             'positions':rows,'dailyVolatility':contribution['dailyVolatility'],
             'annualizedVolatility':None,'maxDrawdown':_drawdown(_curve(basket)) if basket else None},
            'coverage':coverage,'sampleDates':sorted({d for interval in intervals for d in interval}),'symbols':symbols,'covariance':matrix,'weights':weights,
            'attribution':contribution,'pairs':pairs,'stocks':stock,'replays':replays,'evidence':evidence}


def _contributions(symbols, matrix, weights, positions):
    if matrix is None:
        return {'dailyVolatility':None,'contributions':[],'sectors':[],'reconciliationError':None,'diversificationRatio':None}
    sigma_w = [sum(v*weights[j] for j,v in enumerate(row)) for row in matrix]
    variance = sum(weights[i]*v for i,v in enumerate(sigma_w))
    if variance <= 1e-18:
        return {'dailyVolatility':0.0,'contributions':[],'sectors':[],'reconciliationError':None,'diversificationRatio':None}
    vol = math.sqrt(variance)
    rows = [{'symbol':s,'sector':positions[s].get('sector') or 'Unclassified','weight':weights[i],
             'marginalVolatility':sigma_w[i]/vol*100,'componentVolatility':weights[i]*sigma_w[i]/vol*100,
             'riskPercent':weights[i]*sigma_w[i]/variance*100} for i,s in enumerate(symbols)]
    error = sum(p['componentVolatility'] for p in rows)-vol*100
    if abs(error) > 1e-8:
        raise ValueError('Risk contributions do not reconcile')
    sectors = {}
    for p in rows:
        sectors[p['sector']] = sectors.get(p['sector'],0)+p['componentVolatility']
    return {'dailyVolatility':vol*100,'contributions':sorted(rows,key=lambda p:p['componentVolatility'],reverse=True),
            'sectors':[{'sector':s,'componentVolatility':v,'riskPercent':v/(vol*100)*100} for s,v in sectors.items()],
            'reconciliationError':error,'tolerance':1e-8,
            'diversificationRatio':sum(weights[i]*math.sqrt(max(0,matrix[i][i])) for i in range(len(weights)))/vol}


def simulate_risk(snapshot, options):
    """Only a server-loaded owned snapshot is accepted by HTTP adapters."""
    try:
        if not isinstance(options,dict) or set(options)-{'weights','cashWeight','maxHoldingWeight','maxSectorWeight','scenario'}:
            raise ValueError('Unsupported simulation options')
        rows = snapshot['overview']['positions']; by_symbol = {p['symbol']:p for p in rows}
        total = snapshot['overview']['coveredValue']
        proposed = options.get('weights', {s:p['weight'] for s,p in by_symbol.items()})
        if not isinstance(proposed,dict) or set(proposed) != set(by_symbol):
            raise ValueError('Specify every covered holding exactly once')
        cash = options.get('cashWeight',0)
        if any(not finite(v) or not 0 <= v <= 1 for v in [cash,*proposed.values()]) or abs(sum(proposed.values())+cash-1)>1e-8:
            raise ValueError('Long-only weights including cash must sum to 100%')
        max_holding, max_sector = options.get('maxHoldingWeight',1), options.get('maxSectorWeight',1)
        if any(not finite(v) or not 0 < v <= 1 for v in [max_holding,max_sector]):
            raise ValueError('Concentration limits must be between zero and 100%')
        sectors = {}
        for s,w in proposed.items():
            sector = by_symbol[s].get('sector') or 'Unclassified'
            sectors[sector] = sectors.get(sector,0)+w
        if any(w>max_holding+1e-8 for w in proposed.values()) or any(w>max_sector+1e-8 for w in sectors.values()):
            raise ValueError('Proposed allocation exceeds a concentration limit')
        scenario = options.get('scenario',{})
        if not isinstance(scenario,dict) or set(scenario)-{'marketShock','sectorShocks','holdingShocks','topFiveShock','historicalReplay'}:
            raise ValueError('Unsupported scenario')
        replay=None
        if 'historicalReplay' in scenario:
            replay=next((r for r in snapshot.get('replays',[]) if r['id']==scenario['historicalReplay']),None)
            if len(scenario)!=1 or replay is None:raise ValueError('Choose a supported historical replay without other shocks')
            scenario={'holdingShocks':replay['holdingShocks']}
        market = scenario.get('marketShock',0); sector_shocks = scenario.get('sectorShocks',{}); holding_shocks = scenario.get('holdingShocks',{})
        if not isinstance(sector_shocks,dict) or not isinstance(holding_shocks,dict) or set(holding_shocks)-set(by_symbol) or set(sector_shocks)-set(sectors):
            raise ValueError('Scenario names must match covered holdings and sectors')
        shocks = [market,*sector_shocks.values(),*holding_shocks.values()]
        if 'topFiveShock' in scenario:shocks.append(scenario['topFiveShock'])
        if any(not finite(v) or not -1 <= v <= 5 for v in shocks):
            raise ValueError('Price shocks must be between −100% and +500%')
        top = {p['symbol'] for p in rows[:5]}
        def stress(weights):
            impact=[]; sector_pnl={}
            for p in rows:
                s=p['symbol']; sector=p.get('sector') or 'Unclassified'
                shock=holding_shocks.get(s,scenario.get('topFiveShock') if s in top and 'topFiveShock' in scenario else sector_shocks.get(sector,market))
                value=total*weights[s]; pnl=value*shock
                impact.append({'symbol':s,'sector':sector,'value':value,'shock':shock,'pnl':pnl})
                sector_pnl[sector]=sector_pnl.get(sector,0)+pnl
            pnl=sum(p['pnl'] for p in impact)
            return {'pnl':pnl,'stressedValue':total+pnl,'returnPercent':pnl/total*100 if total else None,'holdings':impact,'sectors':sector_pnl}
        symbols=snapshot['symbols']; complete=all(proposed[s]<=1e-12 for s in proposed if s not in symbols)
        attribution=_contributions(symbols,snapshot['covariance'] if complete else None,[proposed[s] for s in symbols],by_symbol)
        return {'status':200,'data':{'simulation':True,'coveredValue':total,'weights':proposed,'cashWeight':cash,
                'sectors':sectors,'attribution':attribution,'current':stress({s:p['weight'] for s,p in by_symbol.items()}),
                'proposed':stress(proposed),'scenario':scenario,'historicalReplay':replay,
                'overlapRule':'Holding overrides top-five, which overrides sector, which overrides market. One shock per holding; cash has zero shock.',
                'limitations':['No orders or holdings changes. No predicted returns, fees, taxes, FX or execution-cost estimates.',
                               'Proposed volatility is unavailable if a positive allocation lacks covariance coverage.'],
                'evidence':snapshot['evidence']}}
    except (ValueError,TypeError,KeyError) as error:
        return {'status':400,'error':str(error)}
