"""Reported annual diagnostics and source-quality warnings, not suitability scores."""
import math
import re
from .numbers import finite
from .dates import parse

def _divide(a,b):
    return a/b if finite(a) and finite(b) and b>0 else None

def analyze_financials(rows,sector):
    ordered=sorted(rows,key=lambda r:r["fiscalYear"])
    latest=ordered[-1] if ordered else {}
    previous=ordered[-2] if len(ordered)>1 else {}
    consecutive=bool(latest and previous and latest["fiscalYear"]==previous["fiscalYear"]+1)
    def growth(field):
        a,b=latest.get(field),previous.get(field)
        return (a-b)/abs(b)*100 if consecutive and finite(a) and finite(b) and b!=0 else None
    metrics={"revenueGrowth":growth("revenue"),"earningsGrowth":growth("netIncome"),"dilution":growth("sharesOutstanding"),
             "cashConversion":_divide(latest.get("operatingCashFlow"),latest.get("netIncome")),
             "freeCashFlowMargin":_divide(latest.get("freeCashFlow"),latest.get("revenue")),
             "debtToEquity":_divide(latest.get("totalDebt"),latest.get("totalEquity")),
             "currentRatio":_divide(latest.get("currentAssets"),latest.get("currentLiabilities")),
             "returnOnAssets":_divide(latest.get("netIncome"),latest.get("totalAssets"))}
    findings=[]
    if metrics["cashConversion"] is not None and metrics["cashConversion"]<1:
        findings.append("Operating cash flow is below reported profit; inspect accruals and working-capital changes.")
    if finite(latest.get("freeCashFlow")) and latest["freeCashFlow"]<0:
        findings.append("Free cash flow is negative in the latest reported annual period.")
    if metrics["dilution"] is not None and metrics["dilution"]>2:
        # JS toFixed rounds the exact binary float, ties away from zero.
        from decimal import Decimal,ROUND_HALF_UP
        rounded=Decimal.from_float(float(metrics["dilution"])).quantize(Decimal("0.1"),rounding=ROUND_HALF_UP)
        findings.append(f"Reported share count increased {rounded:.1f}%; inspect dilution and any share splits before attributing the change.")
    if finite(latest.get("totalEquity")) and latest["totalEquity"]<=0:
        findings.append("Reported equity is non-positive; equity-based valuation and leverage ratios are not interpretable normally.")
    return {"period":latest.get("fiscalYear"),"metrics":metrics,"findings":findings,
            "sectorNote":"Financial institutions require regulatory capital, loan quality and interest-margin disclosures. Generic industrial debt/current-ratio thresholds are not a suitability score." if re.search(r"bank|insurance|financial",sector,re.I) else "Cash conversion, liquidity, dilution and leverage should be assessed together with sector peers.",
            "missing":["Debt maturity schedule","Audited segment/geographic breakdown","Management guidance"]}

def data_quality(quote,rows,now):
    latest=sorted(rows,key=lambda r:-r["fiscalYear"])[0] if rows else {}
    quote=quote or {}
    current=parse(now)
    if current is None:raise ValueError("Invalid observation time")
    def age(stamp):
        parsed=parse(stamp)
        return math.floor((current-parsed).total_seconds()/86400) if parsed else None
    warnings=[]
    qa,fa=age(quote.get("timestamp")),age(latest.get("periodEnd"))
    if qa is not None and qa>7:warnings.append("Quote is more than seven calendar days old; check the exchange calendar and feed status.")
    if fa is not None and fa>550:warnings.append("Latest annual reporting period is more than 18 months old.")
    if not latest:warnings.append("Annual financial coverage is missing.")
    for r in rows:
        assets,liabilities,equity=r.get("totalAssets"),r.get("totalLiabilities"),r.get("totalEquity")
        if all(finite(v) for v in (assets,liabilities,equity)) and abs(assets-liabilities-equity)>max(1,abs(assets)*.02):
            warnings.append(f"FY{r['fiscalYear']}: assets do not reconcile to liabilities plus equity within 2%.")
        reported_age=age(r.get("reportedAt"))
        if reported_age is not None and reported_age<0:warnings.append(f"FY{r['fiscalYear']}: filing date is in the future.")
    periods=[(r["fiscalYear"],r.get("fiscalQuarter") if r.get("fiscalQuarter") is not None else "annual") for r in rows]
    years=sorted({r["fiscalYear"] for r in rows})
    missing=[y for y in range(years[0],years[-1]) if y not in years] if years else []
    if missing:warnings.append(f"Financial history has gaps: {', '.join(map(str,missing))}. Sparse endpoints are not consecutive annual growth.")
    sourced=list(dict.fromkeys(r["fiscalYear"] for r in rows if r.get("sourceUrls")))
    if len(set(periods))!=len(periods):warnings.append("Duplicate reporting periods require reconciliation.")
    return {"quoteAsOf":quote.get("timestamp"),"quoteSource":quote.get("source"),"periodEnd":latest.get("periodEnd"),"filedAt":latest.get("reportedAt"),
            "financialCoverage":{"years":years,"missingYears":missing,"sourceBackedYears":sourced},"warnings":list(dict.fromkeys(warnings)),
            "priceAdjustmentBasis":"Unverified provider basis; corporate-action periods require verification before return analysis."}

def scenarios(row):
    row=row or {}
    return [{"name":name,"growthPercent":growth*100,
             "revenue":row["revenue"]*(1+growth) if finite(row.get("revenue")) else None,
             "netIncome":row["netIncome"]*(1+growth) if finite(row.get("netIncome")) and finite(row.get("revenue")) and row["revenue"]>0 else None,
             "assumption":"Illustrative one-year revenue change at constant net margin; no probability or price target is implied."} for growth,name in [(-.1,"Bear"),(0,"Base"),(.1,"Bull")]]
