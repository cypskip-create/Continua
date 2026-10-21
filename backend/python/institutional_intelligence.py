"""Bounded deterministic institutional research. No network, secrets or trades.

Predictive distributions are separate from confidence intervals for parameters.
Simulation distributions remain hypothetical, even when sourced histories exist.
"""
import hashlib
import json
import math
from datetime import datetime, timezone, date
from collections import deque
from urllib.parse import urlsplit
import re
from investment_intelligence import number, day, evidence

VERSION = 'institutional-intelligence-v1'
KINDS = ('probabilistic-forecast', 'monte-carlo', 'liquidity', 'exposure-graph', 'research-case', 'relationship-draft', 'portfolio-liquidity')


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'Integer must be between {low} and {high}.')
    return value


def bounded(value, low, high):
    value = number(value)
    if not low <= value <= high:
        raise ValueError(f'Value must be between {low} and {high}.')
    return value


def registry():
    requirements = {
        'probabilistic-forecast': 'Dated source-linked levels or returns, availability vintages, target-specific units, >=20 non-overlapping rolling origins before validated forecasts.',
        'monte-carlo': 'Strictly aligned sourced returns, >=120 sessions, owned weights, explicit price-only/total-return basis, deterministic seed.',
        'liquidity': 'Observed volume and raw close, dated provenance, security status, explicit participation; missing volume is not zero.',
        'exposure-graph': 'Verified dated edges, source lineage, typed entities; propagation requires explicit user coefficients.',
        'research-case': 'Canonical company evidence and explicit scenario assumptions; completeness is not quality.',
        'portfolio-liquidity': 'Owned quantities, sourced closes/volume, active status, explicit participation and liquidation sessions; optimization uses server-owned covariance.',
        'relationship-draft': 'Literal disclosed relationship rows with dates and source cells; review is mandatory.',
    }
    return [dict(id=k, name=k.replace('-', ' ').title(), version=VERSION, purpose=requirements[k],
                 inputRequirements=requirements[k], outputSchema='institutional-result-v1', owner='Python Engine',
                 deploymentStatus='research', validationStatus='per-input validation required', lastValidationAt=None,
                 limitations='No institutional accuracy claim. Numerical tests do not establish empirical calibration.') for k in KINDS]


def observations(rows, cutoff):
    if not isinstance(rows, list) or len(rows) > 5000:
        raise ValueError('At most 5000 dated observations are supported.')
    selected = {}
    for row in rows:
        d, available = day(row['date']), day(row['availableAt'])
        if d > cutoff or available > cutoff:
            continue
        evidence(row, cutoff)
        value = number(row['value'])
        if d not in selected or selected[d]['availableAt'] < available:
            selected[d] = dict(row, value=value)
    return [selected[d] for d in sorted(selected)]


def histogram(values, bins=24):
    import numpy as np
    counts, edges = np.histogram(values, bins=bins)
    return [dict(lower=float(edges[i]), upper=float(edges[i+1]), count=int(n)) for i, n in enumerate(counts)]


def wilson(successes, n):
    z = 1.959963984540054
    p = successes/n
    denominator = 1+z*z/n
    center = (p+z*z/(2*n))/denominator
    radius = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denominator
    return [max(0, center-radius), min(1, center+radius)]


def forecast(p):
    import numpy as np
    target = p.get('target', 'price-return')
    if target not in ('price-return', 'total-return', 'portfolio-return', 'volatility', 'revenue-growth', 'earnings-growth', 'dividend-level', 'macro-level'):
        raise ValueError('Unsupported forecast target.')
    frequency = p.get('frequency', 'session')
    fundamental = target in ('revenue-growth', 'earnings-growth', 'dividend-level', 'macro-level')
    if frequency not in (('annual', 'quarterly', 'monthly') if fundamental else ('session',)):
        raise ValueError('Use target-specific observation frequency.')
    if target=='price-return' and p.get('basis')!='price-only':raise ValueError('Price-return targets require raw price-only returns; total returns are a separate target.')
    if fundamental and p.get('basis') not in ('reported-levels','released-macro-levels','declared-dividends','annual-reported','quarterly-reported'):raise ValueError('Fundamental/macro targets require explicit reported or released level observations.')
    if not p.get('unit') or not p.get('basis'):
        raise ValueError('Explicit target units and data basis are required.')
    if target in ('total-return', 'portfolio-return') and p['basis'] != 'verified-total-return':
        raise ValueError('Total-return targets require verified dividend/action-adjusted histories.')
    horizon = integer(p.get('horizon', 20), 1, 252 if not fundamental else 12)
    if target=='volatility' and horizon<2:raise ValueError('Volatility targets require at least two future observed sessions.')
    seed = integer(p.get('seed', 20261021), 0, 2**32-1)
    cutoff = day(p['asOf'])
    rows = observations(p['observations'], cutoff)
    minimum = 12 if fundamental else 120
    method = p.get('method', 'automatic')
    if method not in ('automatic', 'historical-bootstrap', 'ew-residual-bootstrap'):
        raise ValueError('Select a supported baseline model.')
    if fundamental:
        # Period labels are source period ends, never manufactured quarterly data.
        for a, b in zip(rows, rows[1:]):
            months = (int(b['date'][:4])-int(a['date'][:4]))*12+int(b['date'][5:7])-int(a['date'][5:7])
            if months != {'annual':12, 'quarterly':3, 'monthly':1}[frequency]:
                raise ValueError('Missing or irregular reporting periods prevent this forecast.')
    values = np.array([r['value'] for r in rows], dtype=float)
    if not fundamental and any(values <= -1):
        raise ValueError('Simple returns cannot be at or below -100%.')
    if fundamental and target.endswith('growth'):
        if len(values) > 1 and any(values[:-1] <= 0):
            return dict(available=False, reason='Growth forecasts require positive comparable prior-period levels; losses/sign changes are not ratio growth.', validation={})
        series = values[1:]/values[:-1]-1
    elif fundamental:
        series = np.diff(values)
    else:
        series = values
    if len(series) < minimum:
        return dict(available=False, reason=f'At least {minimum} comparable observations are required.', validation={'observations':len(series)})
    def distribution(training, model, rng, draws=600):
        if target == 'volatility':
            return np.std(rng.choice(training, size=(draws, horizon)), axis=1, ddof=1) if horizon > 1 else np.abs(rng.choice(training, draws))
        sampled = rng.choice(training, size=(draws, horizon))
        if model == 'ew-residual-bootstrap':
            weights = np.power(.97, np.arange(len(training)-1, -1, -1)); weights /= weights.sum()
            mean = float(np.sum(weights*training))
            vol = math.sqrt(float(np.sum(weights*(training-mean)**2)))
            standard = float(np.std(training))
            if standard > 1e-14:
                sampled = (sampled-np.mean(training))*vol/standard  # zero drift prevents favorable mean selection
        if fundamental and not target.endswith('growth'):
            return np.sum(sampled, axis=1)
        if np.any(sampled <= -1):
            raise ValueError('Rescaled return sample violates the nonnegative-wealth bound.')
        return np.prod(1+sampled, axis=1)-1
    scores = {m:[] for m in ('historical-bootstrap', 'ew-residual-bootstrap')}
    origins = []
    # Non-overlapping held-out outcome windows; each fit sees only then-available rows.
    for end in list(range(minimum, len(series)-horizon+1, horizon))[-60:]:
        offset = 1 if fundamental else 0
        origin = rows[end-1+offset]['availableAt']
        future_rows=rows[end+offset:end+horizon+offset]
        if len(future_rows)!=horizon or any(row['availableAt']<=origin for row in future_rows):continue
        train_rows = observations(p['observations'], origin)
        if not train_rows or train_rows[-1]['date']!=rows[end-1+offset]['date']:continue
        train = np.array([r['value'] for r in train_rows], dtype=float)
        if fundamental:
            train = train[1:]/train[:-1]-1 if target.endswith('growth') else np.diff(train)
        if len(train) < minimum:
            continue
        actual_slice = series[end:end+horizon]
        actual = float(np.std(actual_slice, ddof=1)) if target == 'volatility' and horizon > 1 else float(abs(actual_slice[0])) if target == 'volatility' else float(np.sum(actual_slice)) if fundamental and not target.endswith('growth') else float(np.prod(1+actual_slice)-1)
        for m in scores:
            prediction = distribution(train, m, np.random.Generator(np.random.PCG64(seed+end)))
            low, median, high = np.quantile(prediction, [.1, .5, .9])
            scores[m].append(dict(date=origin, actual=actual, median=float(median), lower=float(low), upper=float(high), error=float(median-actual), covered=bool(low <= actual <= high), regime='higher-volatility' if np.std(train[-min(60,len(train)):]) > np.std(train) else 'lower-volatility'))
        origins.append(origin)
    comparisons = []
    for m, tests in scores.items():
        n = len(tests)
        selection=tests[:-20] if n>=40 else []
        audit=tests[-20:]
        comparisons.append(dict(method=m, origins=n, mae=float(np.mean([abs(r['error']) for r in tests])) if n else None,
            bias=float(np.mean([r['error'] for r in tests])) if n else None, coverage=sum(r['covered'] for r in tests)/n if n else None,
            coverageWilson95=wilson(sum(r['covered'] for r in audit),len(audit)) if audit else None,
            auditMAE=float(np.mean([abs(r['error']) for r in audit])) if audit else None,auditBias=float(np.mean([r['error'] for r in audit])) if audit else None,auditOrigins=len(audit),auditCoverage=sum(r['covered'] for r in audit)/len(audit) if audit else None,selectionMAE=float(np.mean([abs(r['error']) for r in selection])) if selection else None,
            regimes=[dict(name=regime, observations=len(sub), mae=float(np.mean([abs(r['error']) for r in sub]))) for regime in ('higher-volatility','lower-volatility') if (sub:=[r for r in tests if r['regime']==regime])]))
    selected = 'historical-bootstrap'
    if comparisons[1]['selectionMAE'] is not None and comparisons[1]['selectionMAE'] < comparisons[0]['selectionMAE']*.98:
        selected = 'ew-residual-bootstrap'
    if method != 'automatic':
        selected = method
    score = next(c for c in comparisons if c['method'] == selected)
    calibrated = score['auditOrigins'] >= 20 and score['coverageWilson95'][0] <= .8 <= score['coverageWilson95'][1]
    result = dict(available=calibrated, selectedModel=selected, validation=dict(comparisons=comparisons, rollingOrigins=scores[selected], status='coverage-check-passed' if calibrated else 'insufficient-or-miscalibrated', nominalCoverage=.8),
        observations=len(series), horizon=horizon, inputUnit=p['unit'],unit='decimal cumulative growth' if target.endswith('growth') else p['unit'], target=target, frequency=frequency,
        methodology='Non-overlapping rolling-origin evaluation. At least 20 origins and an 80% predictive interval coverage compatible with its Wilson 95% interval are required. The most recent 60 non-overlapping origins are evaluated; the last 20 are an audit holdout, excluded from model selection. Automatic selection requires at least 40 origins and prefers the baseline unless EW residual bootstrap improves selection-period MAE by 2%. EW scaling assumes zero drift. These checks do not establish regime stability or future accuracy.')
    if not calibrated:
        return dict(result, reason='Forecast distribution withheld: at least 20 non-overlapping, then-available validation origins and compatible interval coverage are required. Current-vintage macro histories cannot be backdated for calibration.')
    maximum_age=7 if not fundamental else {'annual':730,'quarterly':240,'monthly':90}[frequency]
    if (date.fromisoformat(cutoff)-date.fromisoformat(rows[-1]['date'])).days>maximum_age:
        return dict(result,available=False,reason='Latest target observation is stale for its declared frequency; predictive curves withheld.')
    rng = np.random.Generator(np.random.PCG64(seed))
    outcomes = distribution(series, selected, rng, 2000)
    if fundamental and not target.endswith('growth'):
        outcomes += values[-1]
        if target=='dividend-level' and np.any(outcomes<0):return dict(result,available=False,reason='Dividend level model produces negative outcomes; distribution withheld pending a suitable nonnegative model.')
    fan = []
    for step in sorted(set([1, horizon]+list(range(max(1,horizon//12), horizon+1, max(1,horizon//12))))):
        partial = dict(p, horizon=step)
        # Same fitted distribution at each horizon, not interpolation between two endpoints.
        saved_horizon = horizon
        horizon = step
        sample = distribution(series, selected, np.random.Generator(np.random.PCG64(seed)), 1200)
        horizon = saved_horizon
        if fundamental and not target.endswith('growth'):sample += values[-1]
        q = np.quantile(sample, [.1,.5,.9]);fan.append(dict(step=step,lower=float(q[0]),median=float(q[1]),upper=float(q[2])))
    quantiles = dict(zip(('p01','p10','p50','p90','p99'), map(float,np.quantile(outcomes,[.01,.1,.5,.9,.99]))))
    price_scenarios=None
    if target=='price-return' and p.get('initialPrice') is not None:
        reference=number(p['initialPrice'])
        if reference<=0:raise ValueError('Positive sourced reference price required.')
        price_scenarios=dict(referencePrice=reference,referenceDate=rows[-1]['date'],currency=p.get('currency'),quantiles={key:reference*(1+value) for key,value in quantiles.items()})
    return dict(result,priceScenarios=price_scenarios, mean=float(np.mean(outcomes)), median=quantiles['p50'], quantiles=quantiles, distribution=histogram(outcomes), fan=fan,
                uncertainty='Predictive outcome interval; not parameter confidence or a guarantee.', seed=seed)


def return_matrix(p):
    import numpy as np
    symbols = p['symbols']
    if not isinstance(symbols,list) or not 1 <= len(symbols) <= 70 or len(set(symbols)) != len(symbols) or 'CASH' in symbols:
        raise ValueError('Use 1–70 distinct security symbols; cash is a separate sleeve.')
    rows = p['returns']
    if not isinstance(rows,list) or not 120 <= len(rows) <= 1500:
        raise ValueError('120–1500 aligned return sessions are required.')
    cutoff=day(p['asOf']);last=''
    for row in rows:
        evidence(row,cutoff)
        d=day(row['date'])
        if d<=last or d>cutoff or len(row['values'])!=len(symbols):raise ValueError('Returns must be strictly dated and aligned.')
        last=d
    x=np.array([[number(v) for v in row['values']] for row in rows],dtype=float)
    if np.any(x<=-1) or not np.isfinite(x).all():raise ValueError('Returns must be finite and greater than -100%.')
    weights=np.array([bounded(v,0,1) for v in p['weights']],dtype=float)
    if len(weights)!=len(symbols) or weights.sum()>1+1e-9 or weights.sum()<=0:raise ValueError('Long-only weights plus residual cash must sum to one.')
    return symbols,x,weights


def monte_carlo(p):
    import numpy as np
    symbols,x,weights=return_matrix(p)
    horizon=integer(p.get('horizon',20),1,252);paths=integer(p.get('paths',1000),200,5000)
    if paths*horizon*len(symbols)>8_000_000:raise ValueError('Reduce paths, horizon or holdings to the eight-million path-step-holding budget.')
    seed=integer(p.get('seed',20261021),0,2**32-1)
    method=p.get('method','block-bootstrap')
    if method not in ('historical-bootstrap','block-bootstrap','normal-log-returns','factor-bootstrap'):raise ValueError('Unsupported simulation method.')
    basis=p.get('basis')
    if basis not in ('price-only','verified-total-return'):raise ValueError('Declare the return basis; dividends cannot be invented.')
    capital=number(p['capital'])
    if capital<=0:raise ValueError('Positive portfolio value required.')
    alpha=bounded(p.get('confidence',.95),.9,.99);threshold=bounded(p.get('lossThreshold',.1),0,1)
    block=integer(p.get('blockLength',5),1,60)
    fees=bounded(p.get('costBps',0),0,1000)/10000
    rebalance=p.get('rebalance','none')
    if rebalance not in ('none','daily','20-sessions'):raise ValueError('Select none, daily or explicitly assumed 20-session rebalancing.')
    rng=np.random.Generator(np.random.PCG64(seed))
    cash=max(0.,1-float(weights.sum()));w=np.append(weights,cash)
    components=np.tile(w*capital,(paths,1));initial=components.copy()
    if set(p.get('shocks',{}))-set(symbols):raise ValueError('Shock symbols must belong to the modeled portfolio.')
    shock=np.array([bounded(p.get('shocks',{}).get(s,0),-.99,3) for s in symbols])
    components[:,:-1]*=(1+shock)
    nav=np.empty((paths,horizon+1));nav[:,0]=capital
    logs=np.log1p(x)
    diagnostics=dict(observations=len(x),basis=basis,method=method,normality=None,minObservedReturn=float(x.min()),maxObservedReturn=float(x.max()),zeroVarianceAssets=[symbols[i] for i in range(len(symbols)) if float(x[:,i].std())<1e-14])
    root=None;factor_values=None;factor_residuals=None;factor_beta=None;factor_alpha=None
    if method=='factor-bootstrap':
        from investment_intelligence import factor_model
        history=p['factorHistory'];names=history['factors'];factor_rows=history['observations']
        if len(factor_rows)!=len(p['returns']) or [r['date'] for r in factor_rows]!=[r['date'] for r in p['returns']]:raise ValueError('Factor and asset return sessions must match exactly.')
        for row in factor_rows:evidence(row,row['date'])
        configuration=dict(kind='factor-model',asOf=p['asOf'],symbols=symbols,factors=names,weights=(weights/weights.sum()).tolist(),observations=[dict(row,factors=row['values'],returns={symbol:float(x[i,j]) for j,symbol in enumerate(symbols)}) for i,row in enumerate(factor_rows)])
        model=factor_model(configuration);split=model['trainingObservations']
        factor_beta=np.array(model['loadings']);factor_alpha=np.array(model['alpha'])
        all_factors=np.array([[number(row['values'][name]) for name in names] for row in factor_rows])
        baseline=np.sqrt(np.mean((x[split:]-x[:split].mean(axis=0))**2,axis=0))
        if np.mean(np.array(model['holdoutRMSE'])**2)>=np.mean(baseline**2)*.98:raise ValueError('Factor simulation withheld: holdout fit does not improve the training-mean baseline by 2%. Use direct observed block resampling.')
        factor_values=all_factors[:split];factor_residuals=x[:split]-(factor_alpha+factor_values@factor_beta.T)
        diagnostics['factorModel']=dict(factors=names,loadings=model['loadings'],holdoutRMSE=model['holdoutRMSE'],baselineHoldoutRMSE=baseline.tolist(),trainingObservations=split,holdoutObservations=model['holdoutObservations'],assumption='Paired factor blocks and separately paired residual blocks are independent. Residual dependence across holdings is retained. Holdout is excluded from path generation. Contemporaneous fit is not a causal or predictive accuracy certificate.')
        shifts=p.get('factorShocks',{})
        if set(shifts)-set(names):raise ValueError('Unknown factor shock identifier.')
        factor_shock=factor_beta@np.array([bounded(shifts.get(name,0),-.5,.5) for name in names])
        if np.any(factor_shock<=-1):raise ValueError('Factor-return shock implies nonpositive wealth; result withheld.')
        components[:,:-1]*=1+factor_shock
    if method=='normal-log-returns':
        from scipy.stats import jarque_bera
        if paths*horizon*len(symbols)**2>120_000_000:raise ValueError('Parametric multiplication budget exceeded.')
        probabilities=[float(jarque_bera(logs[:,i]).pvalue) for i in range(len(symbols))]
        diagnostics['covarianceRegularization']='90% sample plus 10% spherical covariance; 1e-14 diagonal numerical jitter'
        diagnostics['normality']=dict(test='Jarque-Bera marginal log returns; asymptotic diagnostic with limited small-sample power; does not prove joint normality',pValues=probabilities)
        if min(probabilities)<.05:raise ValueError('Normal log-return simulation withheld: marginal normality diagnostic rejected. Use observed block resampling.')
        c=np.atleast_2d(np.cov(logs,rowvar=False));c=.9*c+.1*np.eye(len(symbols))*np.trace(c)/len(symbols)
        root=np.linalg.cholesky(c+np.eye(len(symbols))*1e-14)
    indices=None;total_cost=0.
    for step in range(horizon):
        if method=='factor-bootstrap':
            if step%block==0:
                factor_index=rng.integers(0,len(factor_values),paths);residual_index=rng.integers(0,len(factor_values),paths)
            else:
                factor_index=(factor_index+1)%len(factor_values);residual_index=(residual_index+1)%len(factor_values)
            sampled=factor_alpha+factor_values[factor_index]@factor_beta.T+factor_residuals[residual_index]
            if np.any(sampled<=-1):raise ValueError('Independent factor/residual resampling generated nonpositive wealth; use direct paired block bootstrap.')
        elif method=='normal-log-returns':
            sampled=np.expm1(rng.normal(size=(paths,len(symbols)))@root.T+logs.mean(axis=0))
        else:
            if method=='historical-bootstrap' or step%block==0:indices=rng.integers(0,len(x),paths)
            elif indices is not None:indices=(indices+1)%len(x)
            sampled=x[indices]
        components[:,:-1]*=1+sampled
        if not np.isfinite(components).all():raise ValueError('Simulation overflow; reduce horizon or inspect returns.')
        if rebalance=='daily' or rebalance=='20-sessions' and (step+1)%20==0:
            total=components.sum(axis=1)
            # Fee-aware target NAV solved to convergence rather than funding fees with negative cash.
            after=total.copy()
            if fees:
                for _ in range(30):
                    prior=after;after=total-fees*np.abs(after[:,None]*w-components).sum(axis=1)
                    if np.max(np.abs(after-prior))<capital*1e-12:break
                else:raise ValueError('Fee-aware rebalance did not converge; result withheld.')
            cost=total-after;total_cost+=float(cost.mean());components=after[:,None]*w
        nav[:,step+1]=components.sum(axis=1)
    if 'inflationAnnual' in p:
        inflation=bounded(p['inflationAnnual'],-.5,5);calendar=integer(p['sessionsPerYear'],1,366)
        deflator=np.power(1+inflation,np.arange(horizon+1)/calendar)
        nav/=deflator;components/=deflator[-1]
        diagnostics['inflationBasis']='Explicit user constant annual inflation and sessions/year assumption; not an observed forecast.'
    terminal=nav[:,-1];losses=capital-terminal
    order=np.argsort(losses)[::-1];mass=paths*(1-alpha);whole=int(math.floor(mass));fraction=mass-whole
    tail_weights=np.zeros(paths);tail_weights[order[:whole]]=1
    if fraction>1e-12:tail_weights[order[whole]]=fraction
    tail_weights/=mass
    es=float(tail_weights@losses) if mass>=10 else None
    contributions=(tail_weights[:,None]*(initial-components)).sum(axis=0) if es is not None else None
    drawdowns=(nav/np.maximum.accumulate(nav,axis=1)-1).min(axis=1)
    fan=[dict(step=i,p10=float(np.quantile(nav[:,i],.1)),median=float(np.median(nav[:,i])),p90=float(np.quantile(nav[:,i],.9))) for i in sorted(set([0,horizon]+list(range(0,horizon+1,max(1,horizon//30)))))]
    quantiles=dict(zip(('p01','p05','p50','p95','p99'),map(float,np.quantile(terminal,[.01,.05,.5,.95,.99]))))
    return dict(horizon=horizon,paths=paths,seed=seed,capital=capital,currency=p['currency'],confidence=alpha,valueBasis='Real value under explicit inflation assumptions' if 'inflationAnnual' in p else 'Nominal value',quantiles=quantiles,
        valueAtRisk=float(np.quantile(losses,alpha,method='linear')),expectedShortfall=es,tailSampleMass=mass,
        expectedShortfallReason=None if es is not None else 'At least ten effective tail paths required.',
        tailContributions=[dict(symbol=s,loss=float(v)) for s,v in zip(symbols+['CASH'],contributions)] if contributions is not None else [],
        tailReconciliationError=float(sum(contributions)-es) if es is not None else None,
        downsideProbability=float(np.mean(terminal<capital)),thresholdBreachProbability=float(np.mean(losses>=capital*threshold)),lossThreshold=threshold,
        drawdownQuantiles=dict(zip(('p01','p10','p50','p90'),map(float,np.quantile(drawdowns,[.01,.1,.5,.9])))),
        distribution=histogram(terminal),tailLosses=histogram(losses),drawdownDistribution=histogram(drawdowns),fan=fan,meanRebalancingCosts=total_cost,
        diagnostics=diagnostics,scenario=dict(type='hypothetical initial holding/factor-return shocks, followed by stochastic paths',shocks=p.get('shocks',{}),factorShocks=p.get('factorShocks',{})),
        methodology='Paired rows preserve cross-security dependence; circular block bootstrap preserves within-block ordering. Buy-and-hold or explicit session rebalancing; no new cash flows. Price-only excludes dividends. VaR is the linear alpha quantile of loss L=initial value minus terminal value. ES is the average worst (1-alpha) fraction of empirical paths, with fractional boundary weighting. Losses and contributions may be negative. These are modeled distributions, not forecasts or guaranteed maximum losses. Rebalancing costs are user proportional assumptions; no precise impact forecast. No trades executed.')


def liquidity(p):
    import numpy as np
    cutoff=day(p['asOf']);participation=bounded(p.get('participation',.1),.001,.3)
    quantity=bounded(p.get('quantity',0),0,1e15)
    rows=p['observations']
    if not isinstance(rows,list) or len(rows)>1500:raise ValueError('Use at most 1500 sourced market sessions.')
    selected=[];last=''
    for row in sorted(rows,key=lambda r:r['date']):
        evidence(row,cutoff);d=day(row['date'])
        if d>cutoff:continue
        if d<=last:raise ValueError('One canonical observation per session is required.')
        last=d
        close=number(row['close'])
        if close<=0:raise ValueError('Positive raw close required.')
        volume=None if row.get('volume') is None else bounded(row['volume'],0,1e18)
        traded=None if row.get('tradedValue') is None else bounded(row['tradedValue'],0,1e20)
        selected.append(dict(date=d,close=close,volume=volume,tradedValue=traded,proxyValue=close*volume if volume is not None else None,sourceUrl=row['sourceUrl']))
    status=p.get('status','unknown');windows=[]
    stale=not last or (date.fromisoformat(cutoff)-date.fromisoformat(last)).days>7
    for n in (20,60,120):
        sample=selected[-n:];known=[r for r in sample if r['volume'] is not None];vol=[r['volume'] for r in known]
        values=[r['tradedValue'] if r['tradedValue'] is not None else r['proxyValue'] for r in known]
        mean=float(np.mean(vol)) if vol else None
        adequate=len(sample)==n and len(known)/n>=.9 and mean is not None and mean>0 and status=='active' and not stale
        warning=None if adequate else 'Capacity unavailable: require a full window, >=90% reported volume, positive activity and active status.'
        no_trade=sum(v==0 for v in vol)/len(vol) if vol else None
        if adequate and no_trade>.5:adequate=False;warning='More than half the observed sessions had no trades; a stable capacity estimate is withheld.'
        sessions=math.ceil(quantity/(participation*mean)) if adequate and quantity else 0 if adequate else None
        windows.append(dict(window=n,observations=len(sample),knownVolume=len(known),missingVolume=len(sample)-len(known),averageDailyVolume=mean,
            averageDailyValue=float(np.mean(values)) if values else None,medianDailyValue=float(np.median(values)) if values else None,
            tradedValueBasis='Reported daily value where present, otherwise close × reported volume proxy; not execution proceeds.',
            noTradeFraction=no_trade,tradingFrequency=1-no_trade if no_trade is not None else None,
            volumeCoefficientOfVariation=float(np.std(vol,ddof=1)/mean) if len(vol)>1 and mean else None,
            quantityOverADV=quantity/mean if mean else None,assumedExecutableQuantity=participation*mean if adequate else None,
            estimatedTradingSessions=sessions,warning=warning))
    age=(date.fromisoformat(cutoff)-date.fromisoformat(last)).days if last else None
    explicit_fees=bounded(p.get('assumedFeesBps',0),0,1000)
    free_float=p.get('freeFloatShares')
    if free_float is not None:
        evidence(p['freeFloatEvidence'],cutoff);free_float=number(free_float)
        if free_float<=0:raise ValueError('Positive sourced free float required.')
    return dict(symbol=p['symbol'],status=status,participation=participation,quantity=quantity,windows=windows,history=selected[-120:],lastObservation=last or None,observationAgeDays=age,
        stalePrice=age is None or age>7,unchangedCloseFraction=sum(a['close']==b['close'] for a,b in zip(selected[-61:],selected[-60:]))/60 if len(selected)>=61 else None,
        freeFloatTurnover60=sum(r['volume'] for r in selected[-60:] if r['volume'] is not None)/free_float if free_float and len(selected)>=60 and all(r['volume'] is not None for r in selected[-60:]) else None,
        assumedFeesBps=explicit_fees,assumedExplicitCost=quantity*selected[-1]['close']*explicit_fees/10000 if selected else None,
        verifiedFeeSchedule=None,bidAskSpread=None,orderBookDepth=None,marketImpact=None,
        methodology='Windows count stored observed sessions, not an inferred exchange calendar. Missing records and missing volume are not zero-volume days. Capacity uses quantity / (participation × mean volume including reported zero days). It is an assumed trading-session requirement, not guaranteed liquidation time. Suspended, unknown-status or inadequately covered securities have no capacity estimate. Fee bps are user assumptions; no current tax, spread or market-impact rate is invented. Coverage components remain separate; no composite liquidity score.')


def portfolio_liquidity(p):
    assets=p['assets']
    if not isinstance(assets,list) or not 1<=len(assets)<=70:raise ValueError('1–70 owned assets required.')
    participation=bounded(p.get('participation',.1),.001,.3)
    sessions=integer(p.get('liquidationSessions',5),1,120)
    minimum_frequency=bounded(p.get('minimumTradingFrequency',.5),0,1)
    diagnostics=[];total=0.
    for asset in assets:
        if asset.get('currency')!='KES':raise ValueError('Portfolio capacity requires compatible KES values; no inferred FX.')
        config=prepare_market_inputs(dict(kind='institutional-inputs',mode='liquidity',asOf=p['asOf'],assets=[asset],options=dict(participation=participation,quantity=asset['quantity'])))
        result=liquidity(config)
        result.pop('history',None) # exact input bars remain in the exported configuration
        latest=config['observations'][-1] if config['observations'] else None
        value=number(asset['quantity'])*latest['close'] if latest else None
        if value is not None:total+=value
        diagnostics.append(dict(symbol=asset['symbol'],quantity=asset['quantity'],positionValue=value,result=result))
    if any(item['positionValue'] is None for item in diagnostics):
        if p.get('optimization') is not None:raise ValueError('Every holding requires a sourced value for liquidity-aware allocation.')
        return dict(holdings=diagnostics,datedPortfolioValue=None,ineligibleValueFraction=None,maximum=None,reason='Missing sourced position values prevent portfolio concentration and capacity caps.',methodology='No missing holding is silently excluded from portfolio liquidity.')
    if total<=0:raise ValueError('Positive sourced position values are required.')
    maximum={};constrained_value=0.
    for item in diagnostics:
        window=item['result']['windows'][1]
        eligible=window['estimatedTradingSessions'] is not None and window['tradingFrequency']>=minimum_frequency
        cap=min(1,window['averageDailyValue']*participation*sessions/total) if eligible else 0.
        maximum[item['symbol']]=cap
        if not eligible:constrained_value+=item['positionValue'] or 0
        item['currentWeight']=(item['positionValue'] or 0)/total;item['liquidityMaximum']=cap
    result=dict(holdings=diagnostics,datedPortfolioValue=total,ineligibleValueFraction=constrained_value/total,maximum=maximum,
        assumptions=dict(participation=participation,liquidationSessions=sessions,minimumTradingFrequency=minimum_frequency),
        methodology='Owned reported quantities valued at each security last sourced raw close; dates may differ. Sixty-observation capacity caps use participation × mean daily traded value × assumed trading sessions / dated portfolio value. Close × volume is a proxy when reported daily value is missing. Suspended, stale or insufficiently traded securities receive a zero proposed cap. This is a hypothetical liquidity constraint, not a guarantee of executable liquidity or market impact.')
    if p.get('optimization') is not None:
        from investment_intelligence import optimize
        config=dict(p['optimization']);provided=config.get('maximum',{});config['maximum']={symbol:min(cap,number(provided.get(symbol,1))) for symbol,cap in maximum.items()}
        baseline=optimize(p['optimization']);constrained=optimize(config)
        result['optimizationComparison']=dict(baseline=baseline,liquidityConstrained=constrained,configuration=config)
    return result

def graph(p):
    cutoff=day(p['asOf']);edges=p.get('edges',[])
    if not isinstance(edges,list) or len(edges)>500:raise ValueError('Exposure exploration is limited to 500 edges.')
    allowed={'owns','subsidiary-of','sector','currency-exposure','commodity-exposure','lends-to','borrows-from','related-party','corporate-action'}
    selected={};revisions=[]
    for edge in edges:
        if edge.get('verification')!='verified' or edge.get('availableAt','9999')>cutoff or edge.get('effectiveDate','9999')>cutoff:continue
        evidence(edge,cutoff);day(edge['effectiveDate'])
        if edge.get('validTo') and day(edge['validTo'])<cutoff:continue
        if edge['type'] not in allowed or edge['from']==edge['to']:raise ValueError('Invalid documented relationship.')
        if edge.get('ownershipPercent') is not None:bounded(edge['ownershipPercent'],0,100)
        revisions.append(edge)
        key=(edge['from'],edge['to'],edge['type'])
        if key not in selected or (edge['effectiveDate'],edge['availableAt'],edge.get('id',''))>(selected[key]['effectiveDate'],selected[key]['availableAt'],selected[key].get('id','')):selected[key]=edge
    edges=list(selected.values());nodes=sorted({e[k] for e in edges for k in ('from','to')})
    if len(nodes)>300:raise ValueError('Graph exceeds the 300-node rendering budget; apply a company filter.')
    adjacency={n:set() for n in nodes};directed={n:set() for n in nodes}
    for e in edges:adjacency[e['from']].add(e['to']);adjacency[e['to']].add(e['from']);directed[e['from']].add(e['to'])
    start=p.get('start');end=p.get('end');path=[]
    if start in adjacency:
        queue=deque([(start,[start])]);seen={start}
        while queue:
            node,route=queue.popleft()
            if node==end:path=route;break
            for other in sorted(adjacency[node]-seen):seen.add(other);queue.append((other,route+[other]))
    propagation=[]
    if p.get('propagation'):
        setting=p['propagation'];shock=bounded(setting['shock'],-1,1);origin=setting['origin']
        if origin not in adjacency:raise ValueError('Shock origin is outside the documented graph.')
        coefficients=setting['coefficients'];levels={origin:shock};visited={origin};frontier=[origin]
        # Explicit acyclic first-discovery tree: no uncontrolled cyclic amplification.
        for _ in range(integer(setting.get('maxDepth',3),1,5)):
            next_nodes=[]
            for node in sorted(frontier):
                for other in sorted(directed[node]):
                    key=node+'->'+other
                    if other in visited or key not in coefficients:continue
                    coefficient=bounded(coefficients[key],0,1);levels[other]=levels[node]*coefficient;visited.add(other);next_nodes.append(other)
            frontier=next_nodes
        propagation=[dict(entity=n,assumedShock=v) for n,v in levels.items()]
    return dict(revisions=revisions,nodes=[dict(id=n,sector=next((e['to'] for e in edges if e['from']==n and e['type']=='sector'),None),entityType=next((e.get('fromType') for e in edges if e['from']==n),next((e.get('toType') for e in edges if e['to']==n),None)),degree=len(adjacency[n]),normalizedDegree=len(adjacency[n])/max(1,len(nodes)-1),portfolioLinked=n in p.get('portfolioSymbols',[])) for n in nodes],edges=edges,path=path,propagation=propagation,
        methodology='Layer A contains verified dated relationships only. Degree centrality describes this incomplete graph, not systemic financial importance. Traversal uses undirected connectivity; documented arrows remain visible. Layer B uses only explicit user pass-through coefficients along a deterministic first-discovery directed tree, at most five hops; cycles are visited once. No ownership percentage is automatically a loss multiplier. Missing coefficients produce no numeric propagation. Conflicting sources remain in exports; this view selects the latest eligible relationship revision.')


def research_case(p):
    cutoff=day(p['asOf']);facts=p.get('facts',[])
    if len(facts)>200:raise ValueError('Research case evidence limit exceeded.')
    summaries=[];categories=set()
    for fact in facts:
        evidence(fact,cutoff);day(fact['date'])
        if fact['date']>cutoff:continue
        value=number(fact['value']);categories.add(fact['category'])
        summaries.append(dict(id=fact['id'],category=fact['category'],label=fact['label'],value=value,unit=fact.get('unit'),sourceUrl=fact['sourceUrl'],date=fact['date'],availableAt=fact['availableAt']))
    statements=[]
    indexed={f['id']:f for f in summaries}
    # Closed, audited templates; arbitrary text is a user note, never generated fact.
    for rule in p.get('comparisons',[])[:30]:
        a=indexed.get(rule.get('current'));b=indexed.get(rule.get('previous'))
        if not a or not b or a['unit']!=b['unit'] or a['category']!=b['category'] or a['date']<=b['date']:continue
        direction='increased' if a['value']>b['value'] else 'decreased' if a['value']<b['value'] else 'was unchanged'
        statements.append(dict(text=f"{a['label']} {direction} between the cited comparable observations.",evidenceIds=[b['id'],a['id']]))
    for fact in summaries:
        if not fact['id'].endswith(':operatingCashFlow'):continue
        income=indexed.get(fact['id'].rsplit(':',1)[0]+':netIncome')
        if income and income['date']==fact['date'] and income['unit']==fact['unit'] and income['value']>0 and fact['value']<income['value']:
            statements.append(dict(text='Reported operating cash flow did not cover positive reported net income in the cited period.',evidenceIds=[income['id'],fact['id']]))
    scenarios=[]
    for case in p.get('scenarios',[])[:3]:
        revenue=number(case['revenue']);growth=bounded(case['growth'],-1,5);margin=bounded(case['netMargin'],-1,1)
        if revenue<0:raise ValueError('Scenario revenue cannot be negative.')
        projected=revenue*(1+growth);earnings=projected*margin;shares=case.get('shares');multiple=case.get('pe')
        eps=earnings/number(shares) if shares is not None and number(shares)>0 else None
        price=eps*bounded(multiple,0,200) if eps is not None and eps>0 and multiple is not None else None
        scenarios.append(dict(name=str(case['name'])[:30],assumptions=case,revenue=projected,earnings=earnings,eps=eps,price=price,priceReason=None if price is not None else 'Positive earnings, positive shares and explicit multiple required.'))
    required=('financial-statements','cash-flow','valuation','risk','liquidity','macro-exposure','contradictory-evidence')
    return dict(facts=summaries,summaries=statements,scenarios=scenarios,coverage=[dict(category=c,available=c in categories) for c in required],
        methodology='Deterministic templates refer only to cited comparable facts. Coverage is documentation completeness, not investment quality. Scenarios use explicit user revenue growth, margin, shares and P/E; they are not analyst estimates. Negative earnings have no P/E price implication. Portfolio fit remains the existing owned Risk Intelligence output; no buy/sell recommendation.')


def relationship_draft(p):
    # This accepts a normalized literal source table, never guesses prose entities.
    cutoff=day(p['asOf']);evidence(p,cutoff);rows=p['rows']
    if not isinstance(rows,list) or len(rows)>500:raise ValueError('Relationship draft limited to 500 literal rows.')
    result=[]
    for index,row in enumerate(rows):
        kind=row['type']
        if kind not in ('owns','subsidiary-of','currency-exposure','related-party','lends-to','borrows-from','commodity-exposure'):raise ValueError('Unrecognized relationship label.')
        if not str(row['from']).strip() or not str(row['to']).strip():raise ValueError('Explicit source entities required.')
        effective=day(row['effectiveDate'])
        if effective>cutoff:raise ValueError('Relationship period is in the future.')
        percent=None if row.get('ownershipPercent') is None else bounded(row['ownershipPercent'],0,100)
        amount=None if row.get('amount') is None else number(row['amount'])
        if amount is not None and not row.get('currency'):raise ValueError('Disclosed amounts require their currency.')
        result.append(dict(row,type=kind,ownershipPercent=percent,amount=amount,effectiveDate=effective,sourceUrl=p['sourceUrl'],availableAt=p['availableAt'],verification='pending',sourceRow=index+1,parserVersion=VERSION))
    return dict(status='requires-review',relationships=result,methodology='Literal source rows only. Entity resolution, source permission and an authorized reviewer are required before graph publication. No prose inference or automatic verification.')


def prepare_research_profile(p):
    cutoff=day(p['asOf']);facts=[];comparisons=[];prior={}
    for row in sorted(p.get('financials',[]),key=lambda r:r.get('fiscalYear',0)):
        if row.get('basis')=='publisher_observation' or not row.get('reportedAt') or not row.get('periodEnd') or not row.get('sourceUrls'):continue
        available=str(row['reportedAt'])[:10];period=str(row['periodEnd'])[:10]
        if available>cutoff or period>cutoff:continue
        currency=row.get('currency')
        if not currency:continue
        for field,label,category in [('revenue','Revenue','financial-statements'),('netIncome','Net income','financial-statements'),('operatingCashFlow','Operating cash flow','cash-flow'),('totalEquity','Closing equity','financial-statements')]:
            if row.get(field) is None:continue
            value=number(row[field]);identity=str(row.get('periodId',row['fiscalYear']))+':'+field
            fact=dict(id=identity,category=category,label=label,value=value,unit=currency,date=period,availableAt=available,sourceUrl=row['sourceUrls'][0])
            facts.append(fact)
            key=(field,currency,row.get('basis'))
            if key in prior and row['fiscalYear']==prior[key][0]+1:comparisons.append(dict(current=identity,previous=prior[key][1]))
            prior[key]=(row['fiscalYear'],identity)
    return dict(kind='research-case',asOf=cutoff,symbol=p['symbol'],facts=facts,comparisons=comparisons,scenarios=[])


def prepare_market_inputs(p):
    """Normalize server-owned canonical bars for both API adapters; no price fills."""
    cutoff=day(p['asOf']);assets=p['assets'];mode=p['mode']
    if not isinstance(assets,list) or not 1<=len(assets)<=70:raise ValueError('Use 1–70 source-covered securities.')
    maps=[]
    for asset in assets:
        if asset.get('currency')!='KES':raise ValueError('Owned research requires KES source values; no FX conversion is inferred.')
        bars={}
        for row in asset['bars']:
            d=str(row.get('date',row.get('timestamp','')))[:10];day(d)
            if d>cutoff:continue
            source_index=row.get('sourceIndex')
            pool=asset.get('sourceUrls',[])
            url=row.get('sourceUrl') or (pool[source_index] if type(source_index) is int and 0<=source_index<len(pool) else None)
            if not isinstance(url,str) or not url.startswith('https://'):continue
            close=number(row['close'])
            if close<=0:continue
            bars[d]=dict(date=d,availableAt=d,sourceUrl=url,close=close,volume=row.get('volume'),tradedValue=row.get('tradedValue'))
        maps.append(dict(sorted(bars.items())[-1501:]))
    options=p.get('options',{})
    if mode=='liquidity':
        a=assets[0]
        return dict(kind='liquidity',asOf=cutoff,symbol=a['symbol'],status=a['status'],quantity=options.get('quantity',a.get('quantity',0)),participation=options.get('participation',.1),assumedFeesBps=options.get('assumedFeesBps',0),observations=list(maps[0].values())[-1500:])
    if any(asset.get('status')!='active' for asset in assets):raise ValueError('Inactive or unknown trading status prevents a current observed-session simulation.')
    for asset,bars in zip(assets,maps):
        first=min(bars) if bars else cutoff
        for action in asset.get('actions',[]):
            if action.get('status')=='cancelled' or action.get('type') not in ('split','bonus_issue','rights_issue','merger','acquisition','suspension','trading_halt'):continue
            when=action.get('effectiveDate') or action.get('exDate')
            if not when or str(when)[:10]>=first:
                raise ValueError('Known structural action within/after this history requires a reviewed adjusted-return mapping; raw price simulation is withheld.')
    common=sorted(set.intersection(*(set(m) for m in maps)))
    if len(common)<121:raise ValueError('At least 121 common sourced closes are required; missing histories are not filled.')
    if (date.fromisoformat(cutoff)-date.fromisoformat(common[-1])).days>7:raise ValueError('Latest aligned price observation is stale.')
    aligned=[]
    for prior,current in zip(common,common[1:]):
        if (date.fromisoformat(current)-date.fromisoformat(prior)).days>4:raise ValueError('A gap over four calendar days prevents session-return modeling; review the exchange calendar and suspensions.')
        aligned.append(dict(date=current,availableAt=current,sourceUrl=maps[0][current]['sourceUrl'],sourceUrls=sorted({m[current]['sourceUrl'] for m in maps}),values=[m[current]['close']/m[prior]['close']-1 for m in maps]))
    lineage=dict(sourceUrls=sorted({row['sourceUrl'] for m in maps for row in m.values()}),sampleStart=common[0],sampleEnd=common[-1],observations=len(aligned),
        availabilityBasis='Dated raw market closes assumed contemporaneously observable at session close. Later provider corrections and unknown actions cannot be reconstructed. Price-only outcomes exclude dividends.',
        portfolioSnapshot=p.get('portfolioSnapshot'))
    if mode=='forecast':
        if len(assets)!=1:raise ValueError('Company forecast accepts one security.')
        return dict(kind='probabilistic-forecast',asOf=cutoff,target='price-return',frequency='session',unit='decimal price return',basis='price-only',initialPrice=maps[0][common[-1]]['close'],currency=assets[0]['currency'],horizon=options.get('horizon',5),method=options.get('method','automatic'),seed=options.get('seed',20261021),observations=[dict(r,value=r['values'][0]) for r in aligned],lineage=lineage)
    if mode!='simulation':raise ValueError('Unknown market preparation mode.')
    allowed={'horizon','paths','method','seed','blockLength','costBps','rebalance','confidence','lossThreshold','shocks','inflationAnnual','sessionsPerYear'}
    if set(options)-allowed:raise ValueError('Unsupported owned simulation option.')
    return dict(options,kind='monte-carlo',asOf=cutoff,symbols=[a['symbol'] for a in assets],weights=[number(a['weight']) for a in assets],capital=number(p['capital']),currency='KES',basis='price-only',returns=aligned,lineage=lineage)


def run(p):
    kind=p['kind']
    if kind not in KINDS:raise ValueError('Unsupported institutional model.')
    if day(p['asOf'])>date.today().isoformat():raise ValueError('Future evidence cutoffs are not supported.')
    encoded=json.dumps(p,sort_keys=True,separators=(',',':'),allow_nan=False)
    if len(encoded.encode())>2*1024**2:raise ValueError('Institutional snapshot exceeds two MiB.')
    handlers=dict(zip(KINDS,(forecast,monte_carlo,liquidity,graph,research_case,relationship_draft,portfolio_liquidity)))
    result=handlers[kind](p)
    digest=hashlib.sha256((VERSION+encoded).encode()).hexdigest()
    dataset={key:value for key,value in p.items() if key in ('observations','returns','edges','facts','rows','assets','factorHistory')}
    data_hash=hashlib.sha256(json.dumps(dataset,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
    urls=set();hashes=set()
    def lineage(value):
        if isinstance(value,dict):
            for key,item in value.items():
                if key=='sourceUrl' and isinstance(item,str):urls.add(item)
                elif key in ('sha256','sourceSha256') and isinstance(item,str) and len(item)==64:hashes.add(item)
                elif key=='sourceUrls' and isinstance(item,list):urls.update(x for x in item if isinstance(x,str))
                elif isinstance(item,(dict,list)):lineage(item)
        elif isinstance(value,list):
            for item in value:lineage(item)
    lineage(p)
    urls={url for url in urls if urlsplit(url).scheme=='https' and urlsplit(url).hostname and not urlsplit(url).username and not urlsplit(url).password}
    hashes={value for value in hashes if re.fullmatch('[a-f0-9]{64}',value)}
    return dict(result,governance=dict(modelId=kind,modelVersion=VERSION,inputHash=digest,dataHash=data_hash,
        calculatedAt=datetime.now(timezone.utc).isoformat(),seed=p.get('seed'),asOf=p['asOf'],
        sourceLineage=dict(sourceUrls=sorted(urls)[:100],artifactHashes=sorted(hashes)[:100],distinctSources=len(urls),truncated=len(urls)>100 or len(hashes)>100),
        parameters={k:v for k,v in p.items() if k not in ('observations','returns','edges','facts','rows','assets','factorHistory')},
        libraries={name:__import__('importlib.metadata',fromlist=['version']).version(name) for name in ('numpy','scipy')},
        dependencies={'factorModel':'investment-intelligence-v1'} if kind=='monte-carlo' and p.get('method')=='factor-bootstrap' else {'optimization':'investment-intelligence-v1'} if kind=='portfolio-liquidity' and p.get('optimization') else {},
        inputSchema='institutional-input-v1',reproducibility='Export or explicitly save the exact configuration. Hash includes model version, source-linked observations and parameters. Clock timestamp is not part of the deterministic hash.'))
