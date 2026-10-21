"""Exact CBK HTML key-rate rows. Rights approval is separate from parsing."""
import calendar
import math
import re
from datetime import date,datetime,timezone
from urllib.parse import urlsplit
from .html import soup

RATE_ROWS={
 'central bank rate':('central_bank_rate','event'), 'kesonia':('kesonia','daily'),
 'cbk discount window':('discount_window_rate','event'), '91-day t-bill':('treasury_bill_91d_auction_yield','auction'),
 'inflation rate':('headline_inflation','monthly'), 'lending rate':('lending_rate','monthly'),
 'savings rate':('savings_rate','monthly'), 'deposit rate':('deposit_rate','monthly'),
}
MONTHS={name.lower():i for i,name in enumerate(calendar.month_name) if name}

def observation_date(text):
    text=text.strip()
    for pattern in ('%d/%m/%Y','%d-%m-%Y'):
        try:return datetime.strptime(text,pattern).date().isoformat()
        except ValueError:pass
    match=re.fullmatch(r'([A-Za-z]+)\s*,?\s*(20\d{2})',text)
    if match and match[1].lower() in MONTHS:
        year,month=int(match[2]),MONTHS[match[1].lower()]
        return date(year,month,calendar.monthrange(year,month)[1]).isoformat()
    raise ValueError('CBK observation date is ambiguous')

def cbk_observations(html,url,available):
    if urlsplit(url).hostname not in ('centralbank.go.ke','www.centralbank.go.ke'):return []
    doc=soup(html);rows=[];seen={}
    for tr in doc.select('tr'):
        cells=[td.get_text(' ',strip=True) for td in tr.find_all(['td','th'],recursive=False)]
        if len(cells)!=3:continue
        key=' '.join(cells[0].lower().split())
        if key not in RATE_ROWS:continue
        text=cells[1].strip().removesuffix('%').strip()
        if not re.fullmatch(r'-?\d+(?:\.\d+)?',text):raise ValueError('CBK key-rate value is ambiguous')
        value=float(text);observed=observation_date(cells[2])
        if not math.isfinite(value) or observed>available:continue
        series,frequency=RATE_ROWS[key]
        identity=(series,observed)
        if identity in seen and seen[identity]!=value:raise ValueError('Conflicting same-date CBK key-rate rows require review')
        if identity in seen:continue
        seen[identity]=value
        rows.append(dict(kind='macro',naturalKey='cbk:'+series,date=observed,availableAt=available,
            payload=dict(series=series,value=value,unit='percent',frequency=frequency,provider='Central Bank of Kenya',
                availabilityBasis='First retrieved official HTML vintage; displayed observation date is not presumed release date',
                yieldBasis='accepted_auction' if frequency=='auction' else None)))
    return rows
