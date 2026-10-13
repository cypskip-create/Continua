"""Observed publisher views, each independently resumable and source-attributed."""
import re
from urllib.parse import urlsplit,urlunsplit,urlencode

STOCK_TABS=["Summary","Financials","Statistics","News","Corporate Actions","Historical Data","Holders","Files"]
FINANCIAL_CATEGORIES=["Profit/Loss","Cash Flow","Assets","Liabilities","Shareholder's Equity"]

def stock_tab_documents(stock_url,tabs=None,categories=None):
    tabs=STOCK_TABS if tabs is None else tabs
    categories=FINANCIAL_CATEGORIES if categories is None else categories
    try:
        base=urlsplit(stock_url)
        if base.scheme!="https" or base.hostname!="kenyanstocks.com" or base.port not in (None,443) or base.username is not None or base.password is not None or not re.fullmatch(r"/stock/nse/[A-Z0-9-]+",base.path):
            return []
    except (ValueError,TypeError):
        return []
    base_url=urlunsplit(("https","kenyanstocks.com",base.path,"",""))
    ticker=base.path.split("/")[-1]
    safe=lambda value:isinstance(value,str) and bool(re.fullmatch(r"[A-Za-z /'&-]{1,60}",value))
    categories=list(dict.fromkeys(c for c in categories if safe(c)))
    documents=[]
    for tab in dict.fromkeys(t for t in tabs if safe(t)):
        for category in (categories if tab=="Financials" else [None]):
            params={"tab":tab}
            if category:
                params["category"]=category.lower()
            documents.append({"url":base_url+"?"+urlencode(params),"title":f"{ticker} · {tab}"+(f" · {category}" if category else ""),
                "discoveredFrom":base_url,"context":{"ticker":ticker,"tab":tab,"category":category,"historyStart":"2015-01-01" if tab=="Historical Data" else None}})
    return documents
