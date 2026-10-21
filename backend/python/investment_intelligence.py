"""Evidence-first Phase 2 models. No I/O, provider credentials or trading side effects.

All dates are ISO calendar dates. Returns/weights are decimal, rates keep their
source units. Publication dates are mandatory for historical fundamental inputs.
"""
import hashlib
import json
import math
import statistics
from datetime import date
from urllib.parse import urlsplit

VERSION = 'investment-intelligence-v1'


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Finite numerical inputs are required.')
    return float(value)


def day(value):
    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
        raise ValueError('ISO calendar dates are required.')
    return value


def evidence(row, as_of):
    url = urlsplit(row.get('sourceUrl', ''))
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise ValueError('Each observation requires an HTTPS evidence source.')
    if day(row['availableAt']) > day(as_of):
        raise ValueError('Evidence was not available at the selected historical cutoff.')


def macro(rows, as_of):
    """Latest available revision per series/date; never backdate revised values."""
    selected = {}
    for row in rows:
        if day(row['availableAt']) > day(as_of) or day(row['date']) > as_of:
            continue
        evidence(row, as_of)
        number(row['value'])
        key = (row['series'], row['date'])
        if key not in selected or row['availableAt'] > selected[key]['availableAt']:
            selected[key] = row
    groups = {}
    for row in selected.values():
        groups.setdefault(row['series'], []).append(row)
    result = []
    for name, values in sorted(groups.items()):
        values.sort(key=lambda v: v['date'])
        if len({(v['unit'], v['frequency']) for v in values}) != 1:
            raise ValueError('A series cannot mix units or frequencies.')
        last = values[-1]
        prior = values[-2] if len(values) > 1 else None
        result.append(dict(series=name, latest=last, history=values,
                           change=last['value']-prior['value'] if prior else None,
                           changeBasis='Difference in source units from preceding stored observation',
                           ageDays=(date.fromisoformat(as_of)-date.fromisoformat(last['date'])).days))
    return dict(series=result, asOf=as_of, methodology='Release-date vintage filter. Missing periods are not interpolated. Observation age is not proof of source freshness. Yield tenors are not interpolated; auction yields are distinct from secondary-market yields.')


def factor_profiles(rows, as_of):
    """Cross-sectional descriptors, not factor betas or predicted returns."""
    specs = {'size': ('marketCap', True), 'value': ('earningsYield', False),
             'momentum': ('momentum12mEx1m', False), 'volatility': ('dailyVolatility', False),
             'liquidity': ('medianTradedValue60d', False), 'dividend': ('dividendYield', False),
             'quality': ('roe', False)}
    result = []
    for name, (field, logarithm) in specs.items():
        eligible = []
        for row in rows:
            if row.get(field) is None or row.get('availableAt', '9999-12-31') > as_of:
                continue
            evidence(row, as_of)
            value = number(row[field])
            if logarithm:
                if value <= 0:
                    continue
                value = math.log(value)
            # ROE is compared within industry to avoid bank/general distortion.
            group = row.get('sector') if name == 'quality' else 'universe'
            if group is None:
                continue
            eligible.append((row, value, group))
        for group in sorted({x[2] for x in eligible}):
            sample = [x for x in eligible if x[2] == group]
            values = [x[1] for x in sample]
            sd = statistics.stdev(values) if len(values) >= 3 else 0
            avg = statistics.mean(values)
            for row, value, _ in sample:
                result.append(dict(symbol=row['symbol'], factor=name, raw=value,
                    exposure=(value-avg)/sd if sd > 1e-12 else None, peers=len(sample), group=group,
                    sourceUrl=row['sourceUrl'], availableAt=row['availableAt']))
    return dict(exposures=result, methodology='Cross-sectional sample z-scores; minimum three peers and nonzero dispersion. Size is log market capitalization. Momentum excludes the most recent month. Quality is within-sector ROE; no industrial leverage ratios are imposed on banks. Missing descriptors are excluded, never zero-filled. These descriptors are not return-regression betas.', missingFactors=['market and sector return factors require aligned source-backed factor return histories'])


def covariance(returns):
    import numpy as np
    x = np.asarray(returns, dtype=float)
    if x.ndim != 2 or not 1 <= x.shape[1] <= 70 or not max(60, x.shape[1]*3) <= x.shape[0] <= 1500 or not np.isfinite(x).all():
        raise ValueError('Need 60 to 1500 aligned returns and at least three observations per asset (maximum 70 assets).')
    sample = np.atleast_2d(np.cov(x, rowvar=False, ddof=1))
    # Explicit conservative fixed shrinkage, not claimed data-optimal/calibrated.
    scale = float(np.trace(sample)/x.shape[1])
    if scale <= 1e-18:
        raise ValueError('History has no measurable risk.')
    return .9*sample + .1*np.eye(x.shape[1])*scale


def factor_model(p):
    import numpy as np
    rows = p['observations']
    names, symbols = p['factors'], p['symbols']
    if not 1 <= len(names) <= 8 or not 1 <= len(symbols) <= 70 or len(set(names)) != len(names) or len(set(symbols)) != len(symbols):
        raise ValueError('Unique factor names (1–8) and symbols (1–70) required.')
    if not max(120, 20*len(names)) <= len(rows) <= 1500:
        raise ValueError('Insufficient aligned factor history (minimum 120 and 20 observations per factor).')
    dates = [day(r['date']) for r in rows]
    if dates != sorted(set(dates)) or dates[-1] > day(p['asOf']):
        raise ValueError('Factor sessions must be unique, chronological and available by cutoff.')
    for row in rows: evidence(row, row['date'])
    x = np.array([[number(r['factors'][f]) for f in names] for r in rows])
    y = np.array([[number(r['returns'][s]) for s in symbols] for r in rows])
    split = len(rows)*2//3
    train, target = x[:split], y[:split]
    xm, ym = train.mean(axis=0), target.mean(axis=0)
    sd = train.std(axis=0, ddof=1)
    if np.min(sd) < 1e-8: raise ValueError('Constant factors cannot identify exposures.')
    z = (train-xm)/sd
    # Ridge on standardized factors; intercept remains unpenalized.
    coefficient = np.linalg.solve(z.T@z + .01*split*np.eye(len(names)), z.T@(target-ym))
    beta = coefficient/sd[:, None]
    alpha = ym-xm@beta
    residual = target-(alpha+train@beta)
    factor_cov = np.atleast_2d(np.cov(train,rowvar=False,ddof=1))
    systematic = beta.T@factor_cov@beta
    diagonal = np.var(residual,axis=0,ddof=1)
    modeled = systematic+np.diag(diagonal)
    holdout = y[split:]-(alpha+x[split:]@beta)
    w = np.array([number(v) for v in p['weights']])
    if len(w) != len(symbols) or min(w) < 0 or abs(sum(w)-1) > 1e-8: raise ValueError('Long-only weights must sum to one.')
    variance = float(w@modeled@w)
    exposure = beta@w
    factor_contribution = exposure*(factor_cov@exposure)
    residual_contribution = w*w*diagonal
    return dict(factors=names,symbols=symbols,loadings=beta.T.tolist(),alpha=alpha.tolist(),portfolioExposures=exposure.tolist(),
        covariance=modeled.tolist(),factorCovariance=factor_cov.tolist(),residualVariances=diagonal.tolist(),dailyVariance=variance,
        factorVarianceContributions=factor_contribution.tolist(),residualVarianceContributions=residual_contribution.tolist(),
        reconciliationError=variance-float(sum(factor_contribution)+sum(residual_contribution)),
        trainingObservations=split,holdoutObservations=len(rows)-split,holdoutRMSE=np.sqrt((holdout**2).mean(axis=0)).tolist(),
        methodology='Chronological first-two-thirds training; fixed ridge penalty 0.01 × training count after standardizing factors. Final third is holdout only. Sigma = B SigmaF Bᵀ + diagonal residual variances. Residual correlations are assumed zero, not empirically proven. Factors require separately sourced aligned returns; descriptor z-scores are not substituted for factor returns. Risk decomposition is algebraic reconciliation, not a calibration certificate.')


def macro_scenario(p):
    result = []
    for item in p['exposures']:
        basis = item['basis']
        if basis not in ('disclosed', 'user-assumption'):
            raise ValueError('Use disclosed exposure or an explicit user assumption.')
        if basis == 'disclosed': evidence(item, p['asOf'])
        amount, shock = number(item['amount']), number(item['shock'])
        if not -1 <= shock <= 10: raise ValueError('Scenario shock outside supported range.')
        result.append(dict(label=item['label'],basis=basis,currency=item['currency'],amount=amount,shock=shock,
                           directChange=amount*shock,sourceUrl=item.get('sourceUrl')))
    return dict(exposures=result,methodology='Direct exposure × hypothetical proportional shock, in each exposure currency. No equity-price prediction, pass-through, hedging, tax or second-order effect is inferred. Rate exposures must be entered as repricing notional and a decimal rate change; FX exposures as verified net currency amounts. Results in different currencies are not aggregated.')


def event_impact(p):
    if p.get('actionCoverageConfirmed') is not True:raise ValueError('Event windows require verified action-adjustment coverage.')
    as_of=day(p['asOf']);bars=p['prices'];dates=[day(b['date']) for b in bars]
    if len(bars)>1500 or dates!=sorted(set(dates)) or any(d>as_of for d in dates):raise ValueError('Chronological observed price sessions at/before cutoff required (maximum 1500).')
    prices=[number(b['close']) for b in bars]
    if not prices or min(prices)<=0:raise ValueError('Positive source-backed closes required.')
    for bar in bars:evidence(bar,as_of)
    windows=[];used=set();excluded=[]
    for event in sorted(p['events'],key=lambda e:e['availableAt']):
        evidence(event,as_of)
        release=day(event['availableAt'])
        # Publication time is unknown: anchor strictly after the release date.
        index=next((i for i,d in enumerate(dates) if d>release),None)
        if index is None or index<20 or index+4>=len(dates):
            excluded.append(dict(id=event['id'],reason='Needs 20 preceding and five subsequent observed sessions.'));continue
        sessions=set(range(index-1,index+5))
        if sessions&used:
            excluded.append(dict(id=event['id'],reason='Overlapping event window excluded.'));continue
        used.update(sessions)
        before=[number(b['volume']) for b in bars[index-20:index] if b.get('volume') is not None]
        after=[number(b['volume']) for b in bars[index:index+5] if b.get('volume') is not None]
        volume_change=statistics.mean(after)/statistics.mean(before)-1 if len(before)==20 and len(after)==5 and min(before+after)>=0 and statistics.mean(before)>0 else None
        windows.append(dict(id=event['id'],type=event['type'],releaseDate=release,start=dates[index-1],end=dates[index+4],
            fiveSessionReturn=prices[index+4]/prices[index-1]-1,volumeChange=volume_change,sourceUrl=event['sourceUrl']))
    groups=[]
    for kind in sorted({r['type'] for r in windows}):
        sample=[r for r in windows if r['type']==kind]
        values=[r['fiveSessionReturn'] for r in sample]
        groups.append(dict(type=kind,samples=len(sample),meanReturn=statistics.mean(values) if len(values)>=10 else None,
            medianReturn=statistics.median(values) if len(values)>=10 else None,
            reason=None if len(values)>=10 else 'At least ten non-overlapping matched events of the same type required.'))
    return dict(windows=windows,groups=groups,excluded=excluded,methodology='Retrospective five-session price change beginning strictly after the dated release (intraday publication time unknown). Volume compares 20 preceding with five following observed sessions. At least ten same-type non-overlapping events required for grouped statistics. No forward filling, causal attribution, probability or future price prediction. Corporate-action coverage must be explicitly verified; raw returns still exclude dividend income.')


def optimize(p):
    import numpy as np
    from scipy.optimize import linprog, minimize
    symbols = list(p['symbols'])
    if len(set(symbols)) != len(symbols) or not symbols:
        raise ValueError('Unique eligible symbols are required.')
    n = len(symbols)
    if 'covariance' in p:
        sample = np.asarray(p['covariance'],dtype=float)
        observations = p['observations']
        if sample.shape != (n,n) or not np.isfinite(sample).all() or not np.allclose(sample,sample.T,atol=1e-12,rtol=0) or np.linalg.eigvalsh(sample).min() < -1e-12 or observations < max(60,n*3):
            raise ValueError('A symmetric positive semidefinite covariance with sufficient common observations is required.')
        scale = float(np.trace(sample)/n)
        if scale <= 1e-18: raise ValueError('History has no measurable risk.')
        c=.9*sample+.1*np.eye(n)*scale
    else:
        c = covariance(p['returns'])
        observations=len(p['returns'])
    if c.shape != (n, n):
        raise ValueError('Return columns must match the eligible universe.')
    current = np.array([number(v) for v in p['currentWeights']])
    if len(current) != n or min(current) < 0 or abs(sum(current)-1) > 1e-8:
        raise ValueError('Current weights must be nonnegative and sum to one.')
    cash_max=number(p.get('cashMaximum',0))
    if not 0<=cash_max<=1:raise ValueError('Cash maximum must be between zero and one.')
    if cash_max:
        if 'CASH' in symbols:raise ValueError('CASH is reserved for the explicit zero-interest cash sleeve.')
        symbols.append('CASH');current=np.append(current,0);c=np.pad(c,((0,1),(0,1)));n+=1
    known=set(symbols)
    if any(set(p.get(key,{}))-known for key in ('minimum','maximum')) or set(p.get('excluded',[]))-known:
        raise ValueError('Constraints refer to a symbol outside the eligible universe.')
    bounds = [(number(p.get('minimum', {}).get(s, 0)), number(p.get('maximum', {}).get(s, 1))) for s in symbols]
    if cash_max:bounds[-1]=(bounds[-1][0],min(cash_max,bounds[-1][1]))
    bounds = [(0, 0) if s in p.get('excluded', []) else b for s, b in zip(symbols, bounds)]
    if any(lo < 0 or hi > 1 or lo > hi for lo, hi in bounds):
        raise ValueError('Holding limits must satisfy 0 ≤ minimum ≤ maximum ≤ 1.')
    a, b = [], []
    sectors = dict(p.get('sectors', {}))
    if cash_max:sectors['CASH']='Cash'
    for sector, limits in p.get('sectorLimits', {}).items():
        mask = np.array([float(sectors.get(s) == sector) for s in symbols])
        lo, hi = number(limits.get('min', 0)), number(limits.get('max', 1))
        if not 0 <= lo <= hi <= 1:
            raise ValueError('Invalid sector limits.')
        a.extend([mask, -mask]); b.extend([hi, -lo])
    feasible = linprog(np.zeros(n), A_ub=np.array(a) if a else None, b_ub=np.array(b) if b else None,
                       A_eq=np.ones((1, n)), b_eq=[1], bounds=bounds, method='highs')
    if not feasible.success:
        raise ValueError('Holding and sector limits are infeasible. Relax the limits or expand eligibility.')
    constraints = [{'type': 'eq', 'fun': lambda w: sum(w)-1}]
    if a:
        aa, bb = np.array(a), np.array(b)
        constraints.append({'type': 'ineq', 'fun': lambda w: bb-aa@w})
    cap = number(p.get('turnoverCap', 1))
    if not 0 <= cap <= 1:
        raise ValueError('Turnover cap must be between zero and one.')
    constraints.append({'type': 'ineq', 'fun': lambda w: cap-np.abs(w-current).sum()/2})
    # HiGHS often returns a vertex. Risk-parity has stationary boundary points;
    # project toward the center of the feasible set before optimizing risk.
    # This is an initialization solve, never a substituted output portfolio.
    center=np.ones(n)/n
    initial=minimize(lambda w:float(((w-center)**2).sum()),feasible.x,method='SLSQP',bounds=bounds,
        constraints=constraints,options={'maxiter':300,'ftol':1e-11})
    if not initial.success:
        raise ValueError('Turnover and allocation limits do not admit a converged feasible initialization. Relax the constraints.')
    objective = p.get('objective', 'minimum-variance')
    scaled = c / np.trace(c)
    vol = np.sqrt(np.diag(scaled))
    def loss(w):
        variance = w@scaled@w
        if objective == 'minimum-variance': return variance
        if variance<1e-18:return 1e6
        if objective == 'risk-parity':
            shares = w*(scaled@w)/variance
            target=(np.diag(c)>0)/sum(np.diag(c)>0)
            return float(((shares-target)**2).sum())
        if objective == 'maximum-diversification': return -(w@vol)/math.sqrt(variance)
        raise ValueError('Select minimum-variance, risk-parity or maximum-diversification.')
    solved = minimize(loss, initial.x, method='SLSQP', bounds=bounds, constraints=constraints,
                      options={'maxiter': 400, 'ftol': 1e-10})
    w = solved.x
    if not solved.success or any(abs(k['fun'](w)) > 1e-6 if k['type'] == 'eq' else np.min(k['fun'](w)) < -1e-6 for k in constraints):
        raise ValueError('Solver could not find a feasible converged allocation. No fallback portfolio was substituted.')
    def measured(weights):
        variance = float(weights@c@weights)
        return dict(dailyVolatility=math.sqrt(max(0,variance)), contributions=(weights*(c@weights)/variance).tolist() if variance>1e-18 else [0.]*n)
    return dict(symbols=symbols, currentWeights=current.tolist(), proposedWeights=w.tolist(),
        current=measured(current), proposed=measured(w), turnover=float(np.abs(w-current).sum()/2), objective=objective,
        solver='SciPy SLSQP; HiGHS linear feasibility', observations=observations,
        methodology='Long-only hypothetical allocation. Equity sample daily covariance with 10% spherical shrinkage. Optional CASH sleeve has zero modeled interest and variance; it is excluded from the risk-parity budget. Full weights, including cash, sum to one. Risk parity/diversification are local numerical solutions, not guaranteed global optima. No expected return, execution price or cost forecast. No holdings were changed.')


def backtest(p):
    """Strict, explicit-basket, raw-close simulator. No inferred action coverage."""
    start, end = day(p['start']), day(p['end'])
    if start >= end or p.get('actionCoverageConfirmed') is not True:
        raise ValueError('Ordered dates and verified complete corporate-action coverage are required.')
    assets = p['assets']
    currency=p['currency']
    if currency not in ('KES','USD','EUR','GBP') or any(a.get('currency')!=currency for a in assets):
        raise ValueError('Every basket member requires the same explicit measurement currency; FX conversion is not inferred.')
    if not 1 <= len(assets) <= 70:
        raise ValueError('Select one to 70 historical basket members.')
    symbols = [a['symbol'] for a in assets]
    if len(set(symbols)) != len(symbols): raise ValueError('Duplicate basket members.')
    prices = {}
    for asset in assets:
        evidence(asset, start)
        if asset.get('basis') != 'raw': raise ValueError('Raw price basis required; adjusted closes would double-count actions.')
        prices[asset['symbol']] = {}
        for bar in asset['prices']:
            d = day(bar['date']); value = number(bar['close'])
            if value <= 0 or d in prices[asset['symbol']]: raise ValueError('Prices must be positive with unique dates.')
            prices[asset['symbol']][d] = value
    sessions = sorted(d for d in prices[symbols[0]] if start <= d <= end)
    if len(sessions) < 3 or sessions[0] != start or sessions[-1] != end:
        raise ValueError('Exact start and end prices and at least three sessions are required.')
    if any(sorted(d for d in prices[s] if start <= d <= end) != sessions for s in symbols):
        raise ValueError('Missing/suspended sessions require explicit handling; this strict basket model refuses to forward-fill.')
    weights = [number(x) for x in p.get('weights', [1/len(assets)]*len(assets))]
    if len(weights) != len(assets) or min(weights) < 0 or sum(weights) > 1+1e-8:
        raise ValueError('Nonnegative basket weights must sum to at most one; the rest stays in cash.')
    capital = number(p['capital']); cost = number(p.get('costBps', 0))/10000
    if capital <= 0 or not 0 <= cost <= .1: raise ValueError('Positive capital and costs between 0 and 1000 bps required.')
    if p.get('rebalance', 'none') not in ('none', 'monthly', 'quarterly'): raise ValueError('Unsupported rebalance frequency.')
    actions = {};seen_actions=set()
    for asset in assets:
        for action in asset.get('actions', []):
            d = day(action['date']); evidence(action, d)
            if action['type'] not in ('split', 'dividend'): raise ValueError('Rights, mergers and delistings need reviewed cash/share mappings; this model refuses unsupported events.')
            v = number(action['value'])
            if v < 0 or (action['type'] == 'split' and v <= 0): raise ValueError('Invalid corporate-action terms.')
            if start < d <= end and d not in sessions: raise ValueError('Corporate action falls on an unmodeled session.')
            if action['type']=='dividend':
                if day(action['exDate'])!=d or day(action['payDate'])<d:
                    raise ValueError('Dividend requires an explicit ex-date matching date and a payment date on or after ex-date.')
            key=(asset['symbol'],action['type'],d,v,action['sourceUrl'])
            if key in seen_actions: raise ValueError('Duplicate corporate-action observation.')
            seen_actions.add(key)
            actions.setdefault(d, []).append((asset['symbol'], action))
    cash, units, trades, curve, history = capital, dict.fromkeys(symbols, 0.), [], [], []
    fees = turnover = 0.;receivables=[];net_invested=dict.fromkeys(symbols,0.);dividend_income=dict.fromkeys(symbols,0.)
    for index, d in enumerate(sessions):
        for s, action in sorted(actions.get(d, []),key=lambda pair:0 if pair[1]['type']=='split' else 1) if index else []:
            if action['type'] == 'split': units[s] *= action['value']
            else:
                entitlement=units[s]*action['value'];receivables.append((action['payDate'],entitlement));dividend_income[s]+=entitlement
        cash+=sum(v for due,v in receivables if due<=d)
        receivables=[(due,v) for due,v in receivables if due>d]
        pending=sum(v for _,v in receivables)
        before = cash+pending+sum(units[s]*prices[s][d] for s in symbols)
        previous = sessions[index-1] if index else d
        rebalance = index == 0 or (p.get('rebalance') == 'monthly' and d[:7] != previous[:7]) or (p.get('rebalance') == 'quarterly' and (d[:4], (int(d[5:7])-1)//3) != (previous[:4], (int(previous[5:7])-1)//3))
        if rebalance:
            # Solve NAV after proportional costs by bisection. Trades execute at
            # the observed close; weights are fixed in advance, not close signals.
            investable=before-pending
            low, high = 0., investable
            for _ in range(60):
                target = (low+high)/2
                traded = sum(abs(target*w-units[s]*prices[s][d]) for s, w in zip(symbols, weights))
                if target+traded*cost > investable: high = target
                else: low = target
            nav = (low+high)/2
            for s, w in zip(symbols, weights):
                delta = nav*w-units[s]*prices[s][d]
                fee = abs(delta)*cost
                units[s] += delta/prices[s][d]; cash -= delta+fee
                net_invested[s]+=delta+fee
                fees += fee; turnover += abs(delta)/before
                trades.append(dict(date=d, symbol=s, value=delta, fee=fee))
        nav = cash+pending+sum(units[s]*prices[s][d] for s in symbols)
        curve.append(dict(date=d, value=nav))
        if rebalance or d in actions or index==len(sessions)-1:
            history.append(dict(date=d, cash=cash, dividendReceivable=pending, units=units.copy()))
    returns = [b['value']/a['value']-1 for a, b in zip(curve, curve[1:])]
    peak, drawdowns = capital, []
    for row in curve:
        peak = max(peak, row['value']); drawdowns.append(dict(date=row['date'], value=row['value']/peak-1))
    years = (date.fromisoformat(end)-date.fromisoformat(start)).days/365.25
    annual = (curve[-1]['value']/capital)**(1/years)-1 if years >= 1 else None
    metrics={}
    calendar=p.get('annualization')
    if calendar:
        evidence(calendar,start)
        periods=number(calendar['sessionsPerYear']);rf=number(calendar['riskFreeAnnual'])
        if not 200<=periods<=366 or not -1<rf<=1:raise ValueError('Annualization requires a valid session count and dated annual risk-free assumption.')
        daily_rf=(1+rf)**(1/periods)-1
        excess=[r-daily_rf for r in returns]
        sd=statistics.stdev(returns)
        downside=math.sqrt(statistics.mean(min(0,r)**2 for r in excess))
        metrics.update(annualizedVolatility=sd*math.sqrt(periods),sharpe=statistics.mean(excess)/sd*math.sqrt(periods) if sd>0 else None,
                       sortino=statistics.mean(excess)/downside*math.sqrt(periods) if downside>0 else None,
                       ratioBasis='Arithmetic mean daily excess return; sample standard deviation; Sortino downside RMS across all observed sessions; supplied dated session calendar/risk-free assumption.')
    else:
        metrics.update(sharpe=None,sortino=None,annualizedVolatility=None,sharpeReason='Verified session calendar and dated risk-free series not supplied.')
    benchmark=p.get('benchmark')
    if benchmark:
        evidence(benchmark,start)
        if benchmark.get('currency')!=currency:raise ValueError('Benchmark and portfolio measurement currencies must match.')
        if benchmark.get('basis')!='total-return':raise ValueError('Basket includes cash dividends; benchmark must be a compatible total-return series.')
        points=benchmark['points']
        if [day(x['date']) for x in points]!=sessions:raise ValueError('Benchmark must match every basket session exactly.')
        values=[number(x['value']) for x in points]
        if min(values)<=0:raise ValueError('Positive benchmark index values required.')
        br=[b/a-1 for a,b in zip(values,values[1:])]
        active=[a-b for a,b in zip(returns,br)];te=statistics.stdev(active)
        metrics.update(benchmarkReturn=values[-1]/values[0]-1,dailyTrackingError=te,
                       annualizedTrackingError=te*math.sqrt(periods) if calendar else None,
                       informationRatio=statistics.mean(active)/te*math.sqrt(periods) if calendar and te>0 else None)
    yearly={}
    prior=capital
    for row in curve:
        year=row['date'][:4]
        yearly.setdefault(year,dict(year=year,startValue=prior,firstObserved=row['date']))
        yearly[year].update(endValue=row['value'],lastObserved=row['date'],returnPercent=(row['value']/yearly[year]['startValue']-1)*100)
        prior=row['value']
    attribution=[dict(symbol=s,endingHoldingValue=units[s]*prices[s][end],dividendIncome=dividend_income[s],netCashInvested=net_invested[s],pnl=units[s]*prices[s][end]+dividend_income[s]-net_invested[s]) for s in symbols]
    residual=sum(row['pnl'] for row in attribution)-(curve[-1]['value']-capital)
    if abs(residual)>max(1e-6,capital*1e-8):raise ValueError('Cash/holdings attribution did not reconcile; result withheld.')
    return dict(currency=currency,attribution=attribution,attributionResidual=residual,
        positiveSessions=sum(r>0 for r in returns),negativeSessions=sum(r<0 for r in returns),unchangedSessions=sum(r==0 for r in returns),
        curve=curve, drawdowns=drawdowns, holdings=history, trades=trades,annualObservedReturns=list(yearly.values()),metrics=metrics,
        cumulativeReturn=curve[-1]['value']/capital-1, annualizedReturn=annual,
        dailyVolatility=statistics.stdev(returns), maxDrawdown=min(x['value'] for x in drawdowns),
        costs=fees, grossTradedNotionalOverNAV=turnover,
        methodology='Explicit historical basket, fixed precommitted weights, fractional shares, raw closes. Dividend entitlement accrues at the ex-date using shares already owned; receivables remain in NAV and pay into cash on the first observed session on/after payment date. Initial close purchases do not earn same-day ex-dividend entitlements. Split ratios apply before same-day post-split per-share dividends. Pending dividends cannot fund rebalancing. No cash interest. User proportional cost assumption charged on buys/sells, including initial investment. Monthly/quarterly rebalance uses first observed session. Strict common sessions; unsupported actions stop the run. Selected basket carries survivorship bias; not an historical index strategy. Annualized return only for windows of at least one year.')


def run_investment(p):
    try:
        kind = p['kind']
        if 'asOf' in p and day(p['asOf'])>date.today().isoformat():raise ValueError('Future evidence cutoffs are not supported.')
        if isinstance(p.get('observations'),list) and len(p['observations'])>5000:raise ValueError('Observation budget exceeded.')
        if kind=='backtest' and day(p['end'])>date.today().isoformat():raise ValueError('Backtests cannot use future sessions.')
        if kind == 'macro':
            result = macro(p['observations'], p['asOf'])
            if p.get('basic') is True:
                for series in result['series']:
                    series['history']=[series['latest']];series['change']=None
                result['access']='Current basic observations; historical trends require Premium.'
        elif kind == 'factors': result = factor_profiles(p['observations'], p['asOf'])
        elif kind == 'factor-model': result = factor_model(p)
        elif kind == 'macro-scenario': result = macro_scenario(p)
        elif kind == 'event-impact': result = event_impact(p)
        elif kind == 'financial-extension':
            from financial_extensions import financial_extensions
            result=financial_extensions(p)
        elif kind == 'optimization': result = optimize(p)
        elif kind == 'backtest': result = backtest(p)
        else: raise ValueError('Unsupported research module.')
        digest = hashlib.sha256(json.dumps({'modelVersion':VERSION,'configuration':p}, sort_keys=True, allow_nan=False, separators=(',', ':')).encode()).hexdigest()
        return dict(status=200, data=dict(result, kind=kind, version=VERSION, snapshotId=digest))
    except (ValueError, KeyError, TypeError, OverflowError, ZeroDivisionError, IndexError, AttributeError) as error:
        return dict(status=422, error=str(error) if isinstance(error, ValueError) else 'Required research fields are missing or invalid.')
