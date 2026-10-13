"""Explicit opt-in preferences; never infer wealth, suitability or risk appetite."""
import copy
import math
import datetime
import re
from .dates import parse,iso

DEFAULTS={"goal":"Balanced","horizon":"1_to_5_years","experience":"beginner","riskComfort":"unspecified","incomeNeeds":"none","sectors":[],"notifications":True,"learnInterests":False,"interests":[]}

def default_preferences():
    return copy.deepcopy(DEFAULTS)

def validate_preferences(raw):
    """Native equivalent of the strict settings schema, with stripped inner keys."""
    invalid={"valid":False}
    if not isinstance(raw,dict) or set(raw)-set(DEFAULTS):
        return invalid
    saved=default_preferences()
    enums={"goal":["Balanced","Income","Growth","Capital preservation","Short-term trading"],
           "horizon":["under_1_year","1_to_5_years","over_5_years"],
           "experience":["beginner","intermediate","experienced"],
           "riskComfort":["unspecified","lower","moderate","higher"],"incomeNeeds":["none","occasional","regular"]}
    for key,allowed in enums.items():
        if key in raw:
            if raw[key] not in allowed:
                return invalid
            saved[key]=raw[key]
    for key in ("notifications","learnInterests"):
        if key in raw:
            if type(raw[key]) is not bool:
                return invalid
            saved[key]=raw[key]
    sectors=raw.get("sectors",[])
    if not isinstance(sectors,list) or len(sectors)>12:
        return invalid
    whitespace=" \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
    saved["sectors"]=[]
    for sector in sectors:
        if not isinstance(sector,str):
            return invalid
        sector=sector.strip(whitespace)
        if not 1<=len(sector.encode("utf-16-le",errors="surrogatepass"))//2<=60:
            return invalid
        saved["sectors"].append(sector)
    interests=raw.get("interests",[])
    if not isinstance(interests,list) or len(interests)>30:
        return invalid
    for interest in interests:
        if not isinstance(interest,dict):
            return invalid
        symbol,exchange,visits=interest.get("symbol"),interest.get("exchange"),interest.get("visits")
        if not isinstance(symbol,str) or not re.fullmatch(r"[A-Z0-9.\-]{1,20}",symbol) or not isinstance(exchange,str) or len(exchange.encode("utf-16-le",errors="surrogatepass"))//2>10:
            return invalid
        if type(visits) not in (int,float) or not math.isfinite(visits) or not 0<=visits<=10000 or visits!=int(visits):
            return invalid
        parsed={"symbol":symbol,"exchange":exchange,"visits":int(visits)}
        if "lastSeen" in interest:
            seen=interest["lastSeen"]
            if not isinstance(seen,str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z",seen) or parse(seen) is None:
                return invalid
            parsed["lastSeen"]=seen
        saved["interests"].append(parsed)
    return {"valid":True,"settings":saved}

def record_interest(settings,symbol,exchange,reset=False,now=None):
    date=parse(now) if now is not None else datetime.datetime.now(datetime.timezone.utc)
    if date is None:
        raise ValueError("invalid_observation_date")
    if reset:
        return dict(settings,interests=[])
    if not settings.get("learnInterests"):
        return settings
    interests=copy.deepcopy(settings["interests"])
    current=next((i for i in interests if i["symbol"]==symbol and i["exchange"]==exchange),None)
    if current and current.get("lastSeen","")[:10]==iso(date)[:10]:
        return settings
    if current:
        current["visits"]=min(current["visits"]+1,10000) if current.get("lastSeen") else 1
        current["lastSeen"]=iso(date)
    else:
        interests.insert(0,{"symbol":symbol,"exchange":exchange,"visits":1,"lastSeen":iso(date)})
    return dict(settings,interests=interests[:30])

def recommendations(settings,now=None):
    date=parse(now) if now is not None else datetime.datetime.now(datetime.timezone.utc)
    if date is None:
        raise ValueError("invalid_observation_date")
    tools={"Income":["Earnings & Reports","Valuation","Evidence"],"Growth":["Forecast","Earnings & Reports","Evidence"],"Capital preservation":["Evidence","Risk lab","Portfolio"]}.get(settings["goal"],["Evidence","Briefing","Forecast"])
    companies=[]
    if settings.get("learnInterests"):
        for interest in settings["interests"]:
            seen=parse(interest.get("lastSeen"))
            if interest["visits"]>0 and seen and seen<=date:
                companies.append((interest,interest["visits"]*math.pow(.5,max(0,(date-seen).total_seconds())/86400/30)))
        companies.sort(key=lambda pair:pair[1],reverse=True)
    return {"tools":tools,"companies":[{"symbol":i["symbol"],"exchange":i["exchange"],"reason":f"Opened on {i['visits']} research day(s); recent interest is weighted more strongly."} for i,_ in companies[:5]],
            "reason":f"Research shortcuts for your explicitly selected {settings['goal'].lower()} focus.",
            "methodology":"Opt-in company interests use a 30-day half-life and one observation per company per day. No inference of wealth, suitability or risk tolerance; no financial model retraining. Disable learning to hide learned suggestions; reset to remove the saved interests."}
