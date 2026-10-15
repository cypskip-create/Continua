from .numbers import finite
from datetime import datetime
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
    if not finite(value) or not finite(rule.get("threshold")):
        return {"triggered":previous.get("triggered",False) if previous else False,"fingerprint":fingerprint,"notify":False,"unavailable":True,"value":None}
    triggered=value>rule["threshold"] if rule["kind"].endswith("above") else value<rule["threshold"]
    return {"triggered":triggered,"fingerprint":fingerprint,"notify":triggered and (not previous or previous.get("triggered") is not True),"unavailable":False,"value":value}

def monitor_evaluation(rule,bundle,now):
    if rule.get('kind') not in KINDS: raise ValueError('unknown monitor kind')
    quote=bundle.get('quote') or {};metrics=(bundle.get('financialAnalysis') or {}).get('metrics') or {}
    changes=bundle.get('changes') or {};quality=bundle.get('quality') or {};dividend=bundle.get('dividendAnalysis') or {}
    at=datetime.fromisoformat(now.replace('Z','+00:00'));age=None
    try:
        timestamp=quote.get('timestamp')
        if not isinstance(timestamp,str): raise ValueError('missing quote timestamp')
        observed=datetime.fromisoformat(timestamp.replace('Z','+00:00'))
        seconds=(at-observed).total_seconds()
        if seconds>=0: age=seconds/86400
    except (KeyError,TypeError,ValueError): pass
    material=[c.get('text','') for c in changes.get('changes',[]) if c.get('material')]
    state=evaluate_monitor(rule,{'price':quote.get('lastPrice'),'debt':metrics.get('debtToEquity'),'growth':metrics.get('revenueGrowth'),
        'earningsGrowth':metrics.get('earningsGrowth'),'cashConversion':metrics.get('cashConversion'),'dividendPayout':dividend.get('payoutRatio'),
        'quoteAge':age,'fingerprint':changes.get('fingerprint'),'material':bool(material),'quoteFresh':age is not None and age<7})
    if not changes.get('fingerprint') and rule['kind']=='material_change':
        state.update({'unavailable':True,'notify':False,'fingerprint':(rule.get('last_state') or {}).get('fingerprint','')})
    state.update({'checkedAt':now,'asOf':quote.get('timestamp') if rule['kind'].startswith('price_') or rule['kind']=='quote_age_above' else quality.get('periodEnd')})
    message=(' '.join(material) if rule['kind']=='material_change' else f"Your {rule['kind'].replace('_',' ')} research threshold was crossed. Review the dated data in Engine.")
    if rule['kind']=='material_change':message=message.encode('utf-16-le',errors='surrogatepass')[:1000].decode('utf-16-le',errors='surrogatepass')
    return {'state':state,'eventKey':state.get('fingerprint') if rule['kind']=='material_change' else now[:10]+':'+rule['kind'],'message':message}
