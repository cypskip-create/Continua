from .numbers import finite
KINDS=["material_change","price_below","price_above","debt_above","revenue_growth_below","earnings_growth_below","cash_conversion_below","dividend_payout_above","quote_age_above"]

def evaluate_monitor(rule,state):
    previous=rule.get("last_state")
    fingerprint=state.get("fingerprint")
    if rule["kind"]=="material_change":
        return {"triggered":False,"fingerprint":fingerprint,"notify":previous is not None and previous.get("fingerprint")!=fingerprint and state.get("material",False)}
    fields={"price_below":"price","price_above":"price","debt_above":"debt","revenue_growth_below":"growth","earnings_growth_below":"earningsGrowth","cash_conversion_below":"cashConversion","dividend_payout_above":"dividendPayout","quote_age_above":"quoteAge"}
    value=state.get(fields.get(rule["kind"]))
    if rule["kind"] in ("price_below","price_above") and not state.get("quoteFresh"):
        value=None
    if not finite(value) or rule.get("threshold") is None:
        return {"triggered":previous.get("triggered",False) if previous else False,"fingerprint":fingerprint,"notify":False,"unavailable":True,"value":None}
    triggered=value>rule["threshold"] if rule["kind"].endswith("above") else value<rule["threshold"]
    return {"triggered":triggered,"fingerprint":fingerprint,"notify":triggered and (not previous or previous.get("triggered") is not True),"unavailable":False,"value":value}
