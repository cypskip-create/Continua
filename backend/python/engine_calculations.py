"""Deterministic Engine lab calculations; no database, network or credentials.

Validated caller-owned assumptions are passed on stdin. Preserve methodology
and missing-value semantics; do not generate market data or probabilities.
"""
import datetime
import json
import math
import sys


def calculate(operation, a):
    if operation == "stress":
        positions, market, sectors = a
        total = sum(p["value"] for p in positions)
        contributions = []
        for p in positions:
            shock = (1 + market) * (1 + sectors.get(p["sector"], 0)) - 1
            contributions.append(dict(p, shock=shock, pnl=p["value"] * shock,
                                      stressedValue=p["value"] * (1 + shock)))
        pnl = sum(p["pnl"] for p in contributions)
        return dict(totalValue=total, pnl=pnl, stressedValue=total+pnl,
                    returnPercent=pnl/total*100 if total > 0 else None,
                    contributions=contributions,
                    assumptions=dict(marketShock=market, sectorShocks=sectors),
                    methodology="One-step market and sector price shocks compound multiplicatively. Current positions only; no inferred beta, trading, tax, liquidity costs or probabilities.")
    if operation == "futures":
        p = a[0]
        direction = 1 if p["side"] == "long" else -1
        quantity = p["multiplier"] * p["contracts"]
        pnl = (p["settlement"]-p["entry"]) * quantity * direction
        stress = p["settlement"] * p["shockPercent"]/100 * quantity * direction
        return dict(notional=p["settlement"]*quantity, pnl=pnl, stressPnl=stress,
                    marginBalance=p["margin"]+pnl, stressedMarginBalance=p["margin"]+pnl+stress,
                    effectiveLeverage=p["settlement"]*quantity/p["margin"] if p["margin"] > 0 else None,
                    expired=p["expiry"] < p["asOf"],
                    basis="User-entered contract multiplier, settlement, expiry and margin. Linear futures only. Margin is collateral, not the maximum loss. No options pricing, exchange margin simulation, trade execution or verified contract feed.")
    if operation == "bond":
        p = a[0]
        date = lambda d: datetime.datetime.fromisoformat(d.replace("Z", "+00:00"))
        t = lambda d: (date(d)-date(p["settlement"])).total_seconds()/86400/365
        y, m = p["yieldPercent"]/100, p["frequency"]
        price = lambda rate: sum(f["amount"]/(1+rate/m)**(m*t(f["date"])) for f in p["cashFlows"])
        dirty, step = price(y), 0.0001
        up, down = price(y+step), price(y-step)
        elapsed = (date(p["settlement"])-date(p["previousCoupon"])).total_seconds()
        period = (date(p["nextCoupon"])-date(p["previousCoupon"])).total_seconds()
        accrued = p["couponPerPeriod"]*elapsed/period
        duration = (down-up)/(2*dirty*step)
        convexity = (down+up-2*dirty)/(dirty*step*step)
        shock = p["shockBps"]/10000
        stressed = price(y+shock)
        return dict(dirtyPrice=dirty, accruedInterest=accrued, cleanPrice=dirty-accrued,
                    modifiedDuration=duration, convexity=convexity, dv01=dirty*duration/10000,
                    stressedDirtyPrice=stressed, pnl=stressed-dirty,
                    approximatePnl=dirty*(-duration*shock+0.5*convexity*shock*shock),
                    cashFlows=[dict(f, presentValue=f["amount"]/(1+y/m)**(m*t(f["date"]))) for f in p["cashFlows"]],
                    basis="User-supplied cash flows per chosen face amount. ACT/365 discount times with nominal yield compounded at the selected frequency; actual/actual coupon-period accrual. Not CBK settlement pricing, tax, transaction fees or an interpolated market curve.")
    if operation == "earnings":
        eps, price, years, growth, pe = a
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in a) or eps <= 0 or price <= 0 or int(years) != years or not 1 <= years <= 10 or not -80 <= growth <= 100 or not 1 <= pe <= 100:
            raise ValueError("invalid_assumptions")
        cells = []
        for g in [growth-10, growth, growth+10]:
            if not -90 <= g <= 110:
                continue
            for multiple in [pe*.75, pe, pe*1.25]:
                projected = eps*(1+g/100)**years
                illustrative = projected*multiple
                cells.append(dict(growthPercent=g, exitPe=multiple, projectedEps=projected,
                                  illustrativePrice=illustrative, changePercent=(illustrative/price-1)*100,
                                  annualizedPriceReturnPercent=((illustrative/price)**(1/years)-1)*100))
        return dict(cells=cells, breakEvenGrowthPercent=((price/(eps*pe))**(1/years)-1)*100,
                    assumptions=dict(eps=eps, currentPrice=price, years=years, growthPercent=growth, exitPe=pe),
                    methodology="Hypothetical EPS × exit P/E sensitivity, not a forecast, fair-value estimate or analyst target. EPS compounds at each entered growth rate with unchanged share basis. Dividends, dilution, fees and taxes are excluded. No probabilities are assigned. Break-even growth only recovers the entered price before those exclusions.")
    raise ValueError("unsupported_operation")


if __name__ == "__main__":
    try:
        payload = sys.stdin.buffer.read(131073)
        if len(payload) > 131072:
            raise ValueError("input_limit")
        request = json.loads(payload, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonfinite")))
        print(json.dumps(calculate(request["operation"], request["args"]), allow_nan=False))
    except Exception:
        print("Engine calculation rejected", file=sys.stderr)
        sys.exit(1)
