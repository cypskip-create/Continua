"""Explicit opt-in preferences; never infer wealth, suitability or risk appetite."""
import copy
import math
import datetime
from .dates import parse,iso

DEFAULTS={"goal":"Balanced","horizon":"1_to_5_years","experience":"beginner","riskComfort":"unspecified","incomeNeeds":"none","sectors":[],"notifications":True,"learnInterests":False,"interests":[]}

def default_preferences():
    return copy.deepcopy(DEFAULTS)

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
