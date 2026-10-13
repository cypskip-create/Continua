from .dates import parse,prior_year
import datetime

def trailing_dividend_per_share(actions,now=None):
    end=parse(now) if now is not None else datetime.datetime.now(datetime.timezone.utc)
    if end is None:
        raise ValueError("invalid_dividend_date")
    start=prior_year(end)
    eligible=[a for a in actions if a.get("details",{}).get("type")=="dividend" and a.get("status")!="cancelled" and parse(a.get("exDate")) and start<parse(a["exDate"])<=end]
    return sum(a["details"]["amountPerShare"] for a in eligible) if eligible else None
