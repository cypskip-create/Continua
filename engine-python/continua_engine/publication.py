"""Explicit reviewed statement schema. Unknown fields are stripped, never guessed."""
import re
from datetime import date,datetime,timezone
from .numbers import finite

STATEMENT_FIELDS={
    'income':['revenue','netIncome','eps','costOfRevenue','grossProfit','operatingExpenses','operatingIncome','dilutedEps','ebitda'],
    'balance':['totalAssets','totalLiabilities','totalEquity','cash','totalDebt','currentAssets','currentLiabilities','sharesOutstanding'],
    'cashflow':['operatingCashFlow','investingCashFlow','financingCashFlow','freeCashFlow','capex']}
REQUIRED={'income':['revenue','netIncome'],'balance':['totalAssets','totalLiabilities','totalEquity'],'cashflow':[]}
WHITESPACE=" \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

def _date(value):
    try:return isinstance(value,str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',value)) and date.fromisoformat(value).isoformat()==value
    except ValueError:return False

def balance_integrity(balance):
    assets,liabilities,equity=(balance.get(k) for k in ('totalAssets','totalLiabilities','totalEquity'))
    if not all(finite(v) for v in (assets,liabilities,equity)) or assets<0 or liabilities<0:return False
    delta=abs(assets-liabilities-equity)
    # Zero assets must actually reconcile; dividing by zero or a negative
    # total must not turn an inconsistent filing into a successful review.
    return delta/assets*100<=2 if assets>0 else delta==0

def _integer(value):return finite(value) and (isinstance(value,int) or value.is_integer())

def validate_historical_confirmation(raw,today=None):
    invalid={'valid':False};today=today or datetime.now(timezone.utc).date().isoformat()
    if not isinstance(raw,dict) or raw.get('statementType') not in STATEMENT_FIELDS or raw.get('unitsVerified') is not True:return invalid
    security=raw.get('securityId')
    if 'securityId' in raw and (not isinstance(security,str) or not re.fullmatch(r'NSE:[A-Z0-9.\-]+',security)):return invalid
    periods=raw.get('periods')
    if not isinstance(periods,list) or not 1<=len(periods)<=20:return invalid
    kind=raw['statementType'];out={'statementType':kind,'unitsVerified':True,'periods':[]};columns=set();keys=set()
    if security is not None:out['securityId']=security
    for entry in periods:
        if not isinstance(entry,dict):return invalid
        column=entry.get('columnIndex');p=entry.get('period');page=entry.get('sourcePage');note=entry.get('note');restatement=entry.get('allowRestatement',False)
        if not _integer(column) or not 0<=column<=19 or not _integer(page) or page<1 or not isinstance(p,dict) or not isinstance(note,str) or type(restatement) is not bool:return invalid
        note=note.strip(WHITESPACE)
        if not 10<=len(note.encode('utf-16-le',errors='surrogatepass'))//2<=2000:return invalid
        year=p.get('fiscalYear');quarter=p.get('fiscalQuarter');period_type=p.get('periodType')
        if not _integer(year) or not 1900<=year<=2100 or period_type not in ('annual','quarterly') or p.get('currency')!='KES':return invalid
        if quarter is not None and (not _integer(quarter) or not 1<=quarter<=4):return invalid
        if (period_type=='annual' and quarter is not None) or (period_type=='quarterly' and quarter is None):return invalid
        if not _date(p.get('periodEnd')) or not _date(p.get('reportedAt')) or p['reportedAt']<p['periodEnd'] or p['reportedAt']>today:return invalid
        key=(period_type,year,quarter or 0)
        if column in columns or key in keys:return invalid
        columns.add(column);keys.add(key)
        period={k:p[k] for k in ('periodType','fiscalYear','periodEnd','reportedAt','currency')}
        period['fiscalYear']=int(year)
        if 'fiscalQuarter' in p:period['fiscalQuarter']=int(quarter) if quarter is not None else None
        saved={'columnIndex':int(column),'period':period,'sourcePage':int(page),'note':note,'allowRestatement':restatement}
        for statement,fields in STATEMENT_FIELDS.items():
            if statement not in entry:continue
            values=entry[statement]
            if not isinstance(values,dict) or any(field not in values for field in REQUIRED[statement]):return invalid
            values={field:values[field] for field in fields if field in values}
            if any(not finite(value) for value in values.values()):return invalid
            saved[statement]=values
        if kind not in saved or (kind=='cashflow' and not saved[kind]):return invalid
        if 'balance' in saved and not balance_integrity(saved['balance']):return invalid
        out['periods'].append(saved)
    return {'valid':True,'data':out}

def resolve_company_entity(raw_name,companies):
    suffix={'plc','ltd','limited','group','kenya','holdings','co','company','incorporated','inc'}
    def normalized(value):return ' '.join(w for w in re.sub(r'[^a-z0-9\s]',' ',value.lower()).split() if w not in suffix)
    raw=normalized(raw_name)
    if not raw:return None
    candidates=[row for row in companies if (name:=normalized(row['name']))==raw or raw in name or name in raw]
    exact=[row for row in candidates if normalized(row['name'])==raw]
    chosen=exact[0] if len(exact)==1 else candidates[0] if len(candidates)==1 else None
    return {k:chosen[k] for k in ('companyId','securityId')} if chosen else None
