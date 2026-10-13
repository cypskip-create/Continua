"""Financial ratio contract; absent fields remain absent, not invented zeros."""
import math
from .numbers import divide, finite, round4

def annualized_volatility(prices):
    if not all(finite(p) and p > 0 for p in prices):
        return None
    returns = [math.log(prices[i]/prices[i-1]) for i in range(1,len(prices))]
    mean = sum(returns)/len(returns)
    return math.sqrt(sum((v-mean)**2 for v in returns)/(len(returns)-1))*math.sqrt(252)

def compute_ratios(i):
    eps = i.get("eps") if finite(i.get("eps")) else divide(i.get("netIncome"),i.get("sharesOutstanding"))
    book = divide(i.get("totalEquity"),i.get("sharesOutstanding"))
    market_cap = i.get("price") * i.get("sharesOutstanding") if finite(i.get("price")) and finite(i.get("sharesOutstanding")) and i.get("sharesOutstanding") != 0 else None
    enterprise = market_cap+(i.get("totalDebt") or 0)-(i.get("cash") or 0) if market_cap is not None else None
    capital = i["totalEquity"]+i["totalDebt"] if finite(i.get("totalEquity")) and finite(i.get("totalDebt")) else None
    history = i.get("priceHistory90d") or []
    momentum = divide(history[-1]-history[0],history[0]) if len(history)>=2 and all(finite(v) for v in history) else None
    volatility = annualized_volatility(history) if len(history)>=3 else None
    values = {
        "pe":divide(i.get("price"),eps), "ps":divide(market_cap,i.get("revenue")),
        "pb":divide(i.get("price"),book), "evEbitda":divide(enterprise,i.get("ebitda")),
        "roe":divide(i.get("netIncome"),i.get("totalEquity")), "roa":divide(i.get("netIncome"),i.get("totalAssets")),
        "roic":divide(i.get("operatingIncome"),capital), "grossMargin":divide(i.get("grossProfit"),i.get("revenue")),
        "operatingMargin":divide(i.get("operatingIncome"),i.get("revenue")), "netMargin":divide(i.get("netIncome"),i.get("revenue")),
        "dividendYield":divide(i.get("dividendPerShareTtm"),i.get("price")), "payoutRatio":divide(i.get("dividendPerShareTtm"),eps),
        "currentRatio":divide(i.get("currentAssets"),i.get("currentLiabilities")), "debtToEquity":divide(i.get("totalDebt"),i.get("totalEquity")),
        "interestCoverage":divide(i.get("operatingIncome"),i.get("interestExpense")),
        "priceMomentum3m":momentum, "volatility90d":volatility,
    }
    return {k:round4(v) for k,v in values.items() if round4(v) is not None}

def yoy_growth(current, prior):
    return (current-prior)/abs(prior) if finite(current) and finite(prior) and prior != 0 else None
