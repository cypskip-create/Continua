"""Observed-return risk; no inferred prices, rates or corporate actions."""
import math
import re
from datetime import date
from .numbers import finite
from .dates import parse
from .portfolio import daily_close_map, portfolio_analysis

def _mean(v):
    return sum(v)/len(v)

def _cov(a,b):
    x,y=_mean(a),_mean(b)
    return sum((v-x)*(b[i]-y) for i,v in enumerate(a))/(len(a)-1)

def risk_contributions(returns,weights):
    symbols=[s for s in returns if finite(weights.get(s)) and weights[s]>0]
    n=len(returns[symbols[0]]) if symbols else 0
    if n<20 or any(len(returns[s])!=n or any(not finite(v) for v in returns[s]) for s in symbols):
        return None
    coverage=sum(weights[s] for s in symbols)
    w=[weights[s]/coverage for s in symbols]
    matrix=[[_cov(returns[a],returns[b]) for b in symbols] for a in symbols]
    marginal=[sum(c*w[j] for j,c in enumerate(row)) for row in matrix]
    variance=sum(v*marginal[i] for i,v in enumerate(w))
    if not finite(variance) or variance<=1e-18:
        return None
    ordered=sorted(sum(w[j]*returns[s][i] for j,s in enumerate(symbols)) for i in range(n))
    tail_count=math.ceil(n*.05)
    return {"coveredWeight":coverage,"observations":n,
            "contributions":[{"symbol":s,"weight":w[i],"varianceContribution":w[i]*marginal[i],"riskShare":w[i]*marginal[i]/variance} for i,s in enumerate(symbols)],
            "historicalVaR95":max(0,-ordered[max(0,tail_count-1)])*100 if n>=60 else None,
            "expectedShortfall95":max(0,-_mean(ordered[:tail_count]))*100 if n>=60 else None,
            "tailObservations":tail_count if n>=60 else 0,
            "methodology":"Sample covariance attribution on identical observed daily returns; contributions sum to portfolio variance. Negative contributions can hedge other holdings. Historical one-day 95% VaR/expected shortfall require 60 observations and are not a maximum loss or a forecast."}

def _volatility(v):
    average=_mean(v)
    return math.sqrt(sum((x-average)**2 for x in v)/(len(v)-1))*math.sqrt(252)*100

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

def portfolio_risk(series,weights):
    usable={s:bars for s,bars in series.items() if finite(weights.get(s)) and weights[s]>0 and sum(finite(b.get("close")) and b["close"]>0 for b in bars)>=21}
    symbols=list(usable)
    maps={s:daily_close_map(bars) for s,bars in usable.items()}
    dates=sorted(d for d in maps[symbols[0]] if all(d in maps[s] for s in symbols)) if symbols else []
    returns={s:[] for s in symbols}
    excluded=0
    for before,after in zip(dates,dates[1:]):
        if (parse(after)-parse(before)).total_seconds()>4*86400:
            excluded+=1
            continue
        for s in symbols:
            returns[s].append(maps[s][after]/maps[s][before]-1)
    count=len(returns[symbols[0]]) if symbols else 0
    coverage=sum(weights[s] for s in symbols)
    result={"available":False,"reason":"At least 20 common short-interval returns are required for portfolio risk.","symbols":symbols,"observations":count,"excludedIntervals":excluded,"coveredWeight":coverage,"metrics":None}
    if not symbols or count<20 or coverage<=0:
        return result
    basket=[_mean([returns[s][i] for s in symbols]) for i in range(count)]
    weighted=[sum(returns[s][i]*weights[s] for s in symbols)/coverage for i in range(count)]
    bm,pm=_mean(basket),_mean(weighted)
    variance=sum((r-bm)**2 for r in basket)
    covariance=sum((r-pm)*(basket[i]-bm) for i,r in enumerate(weighted))
    result.update(available=True,reason="Hypothetical daily-rebalanced current-weight basket; excluded gaps are omitted. Beta compares your holdings' equal-weight basket, not an exchange index. Sharpe and Sortino require a verified risk-free-rate feed and are unavailable.",metrics={
        "attribution":risk_contributions(returns,weights),"portfolioVolatility":_volatility(weighted),"marketVolatility":_volatility(basket),"portfolioMaxDrawdown":_drawdown(_curve(weighted)),
        "portfolioBeta":covariance/variance if variance>0 else None,"sharpe":None,"sortino":None,
        "volatilityByHolding":[{"symbol":s,"volatility":_volatility(returns[s])} for s in symbols],
        "drawdownByHolding":[{"symbol":s,"drawdown":_drawdown(_curve(returns[s]))} for s in symbols]})
    return result

def total_return_series(points,actions):
    bars=sorted(points,key=lambda p:p["date"])
    if len({p["date"] for p in bars})!=len(bars) or any(not finite(p.get("close")) or p["close"]<=0 for p in bars):
        raise ValueError("Unique positive dated closes required")
    def valid_date(v):
        try:return isinstance(v,str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}",v)) and date.fromisoformat(v).isoformat()==v
        except ValueError:return False
    if any(not valid_date(p["date"]) for p in bars):
        raise ValueError("Real calendar dates required")
    for a in actions:
        split,dividend=a.get("splitRatio"),a.get("dividend")
        if not valid_date(a.get("date")) or not isinstance(a.get("sourceUrl"),str) or not a["sourceUrl"].lower().startswith("https://") or (split is not None and (not finite(split) or split<=0)) or (dividend is not None and (not finite(dividend) or dividend<0)) or (split is None and dividend is None):
            raise ValueError("Valid source-backed corporate actions required")
    if any(a.get("splitRatio") is not None and any(b["date"]==a["date"] and b.get("dividend") is not None for b in actions) for a in actions):
        raise ValueError("Same-date split and dividend require a verified per-share basis mapping")
    keys=[(a["date"],"split" if a.get("splitRatio") is not None else "dividend") for a in actions]
    if len(set(keys))!=len(keys):
        raise ValueError("Duplicate corporate-action dates require reconciliation")
    wealth,output=100,[]
    for i,bar in enumerate(bars):
        if i:
            prev=bars[i-1]
            events=[a for a in actions if prev["date"]<a["date"]<=bar["date"]]
            if any(a["date"]!=bar["date"] for a in events):
                raise ValueError("An action date lacks an observed close; adjustment cannot be inferred across a gap")
            ratio=math.prod(a["splitRatio"] if a.get("splitRatio") is not None else 1 for a in events)
            dividend=sum(a["dividend"] if a.get("dividend") is not None else 0 for a in events)
            wealth*=(bar["close"]*ratio+dividend)/prev["close"]
        output.append({"date":bar["date"],"index":wealth})
    return output

def portfolio_overview(positions,exchange,now):
    analysis=portfolio_analysis(positions)
    covered=[p for p in positions if finite(p.get("price")) and p["price"]>0 and p["shares"]>0]
    total_cost=sum(p["cost"] for p in covered)
    dates={p.get("asOf")[:10] if p.get("asOf") else None for p in covered}
    same=len(dates)==1 and None not in dates
    current=parse(now)
    if current is None:raise ValueError("Invalid observation time")
    stale=[p for p in covered if not parse(p.get("asOf")) or (current-parse(p["asOf"])).total_seconds()>7*86400 or (parse(p["asOf"])-current).total_seconds()>86400]
    warnings=list(analysis["warnings"])
    if covered and not same:warnings.append("Session contribution is unavailable because quote dates differ or are missing.")
    if stale:warnings.append(f"{len(stale)} holding quotes are stale; values reflect their dated last price.")
    return dict(analysis,exchange=exchange,currency=covered[0].get("currency") if covered else None,
                totalCost=total_cost if analysis["available"] else None,unrealized=analysis["totalValue"]-total_cost if analysis["available"] else None,
                sessionPnl=analysis["sessionPnl"] if same and not stale else None,sessionDate=next(iter(dates)) if same else None,
                holdingCount=len(positions),pricedCount=len(covered),warnings=warnings,
                methodology="Engine calculates recorded holdings, cost basis, allocation and unrealized changes from dated market quotes. Cash, closed trades, tax and brokerage fees are excluded.",generatedAt=current.isoformat(timespec="milliseconds").replace("+00:00","Z"))
