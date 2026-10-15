"""Dated AFX quote candidates, with missing fields retained as unavailable.

No fetch-time timestamp, active-security inference, scaled-volume guess or flat
OHLC substitution. Canonical publication remains a separate reviewed boundary.
"""
import math
import re
from datetime import datetime,timezone,date
from .html import soup

def literal_number(raw):
    if not isinstance(raw,str):return None
    raw=re.sub(r'^KES\s*|\s*KES$','',raw.strip(),flags=re.I)
    if not re.fullmatch(r'-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?',raw):return None
    value=float(raw.replace(',',''))
    return value if math.isfinite(value) else None

def trading_day(raw):
    if not isinstance(raw,str) or len(raw)>80:return None
    for fmt in ('%Y-%m-%d','%A, %B %d, %Y','%A, %d %B %Y','%B %d, %Y'):
        try:return datetime.strptime(raw.strip(),fmt).date().isoformat()
        except ValueError:pass
    return None

def quote_candidate(html,symbol,now=None,*,document=None):
    if not isinstance(symbol,str) or not re.fullmatch(r'[A-Z0-9-]{1,20}',symbol):return None
    page=document if document is not None else soup(html)
    title=page.title.get_text().strip() if page.title else ''
    identity=re.fullmatch(r'([A-Z0-9-]+)\s*-\s*(.+)',title)
    if identity is None or identity[1]!=symbol:return None
    for node in page.select('script,style,nav,footer,#comments'):node.decompose()
    # Keep price, previous close and session date in the same source paragraph;
    # unrelated news/peer prose elsewhere cannot supply a missing field.
    paragraphs=[re.sub(r'\s+',' ',p.get_text(' ',strip=True)) for p in page.select('p')]
    text=next((p for p in paragraphs if re.search(r'current share price of .+? is KES\s*[\d,.]+',p,re.I)),'')
    current=re.search(r'current share price of (.+?) is KES\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?=\s|[,.;](?:\s|$)|$)',text,re.I)
    previous=re.search(r'previous closing price of\s*([\d,.]+)\s*KES',text,re.I)
    observed=re.search(r'closed its last trading day \(([^)]+)\)',text,re.I)
    # A related-stock paragraph must not become this issuer's current quote.
    normalize=lambda value:re.sub(r'\s+',' ',value).strip().casefold()
    if current is None or normalize(current[1])!=normalize(identity[2]):return None
    price=literal_number(current[2]);prior=literal_number(previous[1]) if previous else None
    stamp=trading_day(observed[1]) if observed else None
    today=datetime.now(timezone.utc).date().isoformat() if now is None else date.fromisoformat(now).isoformat()
    if price is None or price<=0 or stamp is None or stamp>today:return None
    labels={}
    for row in page.select('table tr'):
        cells=row.find_all(['th','td'],recursive=False)
        if len(cells)==2:labels[normalize(cells[0].get_text(' ',strip=True))]=cells[1].get_text(' ',strip=True)
    opening,high,low=[literal_number(labels.get(key)) for key in ('opening price',"day's high price","day's low price")]
    if any(value is not None and value<0 for value in (opening,high,low,prior)):return None
    if high is not None and low is not None and high<low:return None
    volume=literal_number(labels.get('traded volume'))
    if volume is not None and (volume<0 or volume!=int(volume) or volume>9007199254740991):volume=None
    delta=(price-prior)*100 if prior is not None and prior>0 else None
    ratio=(price-prior)/prior*10000 if prior is not None and prior>0 else None
    change=math.floor(delta+.5)/100 if delta is not None and math.isfinite(delta) else None
    percent=math.floor(ratio+.5)/100 if ratio is not None and math.isfinite(ratio) else None
    return {'kind':'afx_quote_candidate','symbol':symbol,'companyName':identity[2].strip(),'lastPrice':price,'previousClose':prior,
        'open':opening,'high':high,'low':low,'volume':int(volume) if volume is not None else None,
        'change':change,'changePercent':percent,'currency':'KES','tradingDate':stamp,
        'basis':'Publisher last trading session date, not fetch time. Missing ranges and exact volume stay unavailable; no security status inferred.'}
