import datetime
from .dates import parse
from .numbers import positive, compatible_currency
from .ratios import compute_ratios
from .valuation import annual_ratio_at

def reported_research_rows(quote,history):
    if not quote or not quote.get('timestamp'):return []
    at=quote['timestamp'][:10]
    return [r for r in history if r.get('basis')!='publisher_observation' and compatible_currency(r.get('currency'),quote.get('currency')) and r.get('periodEnd') and r.get('reportedAt') and r['periodEnd'][:10]<=at and r['reportedAt'][:10]<=at and any(isinstance(u,str) and u.lower().startswith('https://') for u in r.get('sourceUrls') or [])]

def reported_research_ratios(security_id,quote,history,dividend_per_share,now=None):
    date=parse(now) if now is not None else datetime.datetime.now(datetime.timezone.utc)
    observed=parse(quote.get("timestamp")) if quote else None
    if not quote or quote.get("source")=="mock" or not positive(quote.get("lastPrice")) or observed is None or date is None or observed>date:
        return None
    rows=reported_research_rows(quote,history)
    if not rows:
        return None
    latest=sorted(rows,key=lambda p:p["fiscalYear"],reverse=True)[0]
    values=compute_ratios(dict(latest,price=quote["lastPrice"],dividendPerShareTtm=dividend_per_share))
    values.update(securityId=security_id,asOf=quote["timestamp"])
    for name in ("pe","pb","ps"):
        ratio=annual_ratio_at(rows,quote["lastPrice"],quote["timestamp"],name)["ratio"]
        if ratio is None:
            values.pop(name,None)
        else:
            values[name]=ratio
    return values
