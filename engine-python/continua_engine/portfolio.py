from .risk_intelligence import build_risk_intelligence
from continua_risk import portfolio_analysis, daily_close_map
"""Covered holdings, dated returns and correlation without fabricated coverage."""
import math
from .dates import parse
from .numbers import finite


def performance(points,dated_flows=None):
    ordered=sorted(points,key=lambda p:p["date"])
    if len(ordered)<2:
        return {"twr":None,"moneyWeighted":None,"reason":"At least two complete dated valuation snapshots are needed."}
    product=1
    for before,after in zip(ordered,ordered[1:]):
        if before["value"]<=0 or not finite(after.get("value")) or not finite(after.get("flow")):
            return {"twr":None,"moneyWeighted":None,"reason":"Invalid valuation or flow coverage."}
        product*=(after["value"]-after["flow"])/before["value"]
    start,end=ordered[0],ordered[-1]
    external=[{"date":f["date"],"amount":-f["amount"]} for f in dated_flows if start["date"]<f["date"]<=end["date"]] if dated_flows is not None else [{"date":p["date"],"amount":-p["flow"]} for p in ordered[1:] if p["flow"]!=0]
    cash=[{"date":start["date"],"amount":-start["value"]},*external,{"date":end["date"],"amount":end["value"]}]
    base=parse(start["date"])
    finish=parse(end["date"])
    weighted=None
    def npv(rate):
        try:return sum(c["amount"]/(1+rate)**((parse(c["date"])-base).total_seconds()/(365.25*86400)) for c in cash)
        except (ValueError,OverflowError,ZeroDivisionError,TypeError):return None
    lo,hi=-.9999,10
    if base and finish and finish>base and finite(npv(lo)) and finite(npv(hi)) and npv(lo)*npv(hi)<0:
        for _ in range(100):
            mid=(lo+hi)/2
            if npv(lo)*npv(mid)<=0:
                hi=mid
            else:
                lo=mid
        weighted=(lo+hi)/2
    return {"twr":(product-1)*100,"moneyWeighted":weighted*100 if weighted is not None else None,"reason":"End-of-period external-flow convention. Money-weighted return is annualized; snapshots exclude unrecorded cash and dividends."}


def aligned_returns(series):
    maps={s:daily_close_map(bars) for s,bars in series.items()}
    symbols=list(maps)
    dates=sorted(d for d in maps[symbols[0]] if all(d in maps[s] for s in symbols)) if symbols else []
    intervals=[(date,dates[i]) for i,date in enumerate(dates[1:]) if (parse(date)-parse(dates[i])).total_seconds()<=4*86400]
    returns={s:[maps[s][date]/maps[s][before]-1 for date,before in intervals] for s in symbols}
    pairs=[]
    for i,a in enumerate(symbols):
        for b in symbols[i+1:]:
            x,y=returns[a],returns[b]
            n=len(x);mx=sum(x)/n if n else 0;my=sum(y)/n if n else 0
            cov=sum((v-mx)*(y[k]-my) for k,v in enumerate(x))
            den=math.sqrt(sum((v-mx)**2 for v in x)*sum((v-my)**2 for v in y))
            pairs.append({"a":a,"b":b,"correlation":cov/den if n>=20 and den>0 else None})
    return {"dates":dates,"pairs":pairs,"methodology":"Pearson correlation using identical common short trading-date intervals and the chronologically last close per day. Gaps over four calendar days are excluded; at least 20 overlapping returns required."}
