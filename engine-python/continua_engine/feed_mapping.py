"""Literal NSE feed mapping/normalization. Publication validates separately."""
import math
import re
from datetime import datetime,timezone,timedelta
from .numbers import finite
from .publication import WHITESPACE

STATUS={'ACTIVE':'active','SUSPENDED':'suspended','HALTED':'halted','DELISTED':'delisted'}
INTERVAL={'1MIN':'1m','5MIN':'5m','15MIN':'15m','1HR':'1h','1D':'1d','1W':'1w','1MO':'1M','1Y':'1y'}
SECTORS=['Banking','Insurance','Telecommunications','Energy & Petroleum','Manufacturing & Allied','Construction & Allied','Agricultural','Commercial & Services','Investment','Real Estate','Technology','Automobiles & Accessories']

def pick(raw,mapping):return {target:raw[source] for target,source in mapping.items() if source in raw}
def slug(name):return re.sub(r'[^a-z0-9]+','-',name.strip(WHITESPACE).lower()).strip('-')
def rounded(v):
    if not finite(v) or not finite(v*100):raise ValueError('finite source number required')
    return math.floor(v*100+.5)/100
def utc(value):
    if not isinstance(value,str) or 'T' not in value:raise ValueError('dated feed observation required')
    at=datetime.fromisoformat(value.replace('Z','+00:00').replace('z','+00:00'))
    if at.tzinfo is None:at=at.replace(tzinfo=timezone(timedelta(hours=3)))
    return at.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def symbol(raw):
    s=raw.get('Symbol')
    if not isinstance(s,str) or not re.fullmatch(r'[A-Za-z0-9.\- ]{1,20}',s):raise ValueError('feed symbol unavailable')
    return s

def map_feed(kind,raw,profile=None,identifier=None):
    if not isinstance(raw,dict):raise ValueError('invalid feed packet')
    s=symbol(raw);security='NSE:'+s;company='NSE:company:'+s
    if kind=='security':
        out={'id':security,'symbol':s,'exchange':'NSE','companyId':company,'currency':'KES',**pick(raw,{'isin':'ISIN','listedAt':'ListingDate'})}
        if raw.get('TradingStatus') in STATUS:out['status']=STATUS[raw['TradingStatus']]
        return out
    if kind=='sector':return {'id':slug(raw['Sector']),'name':raw['Sector'].strip(WHITESPACE)}
    if kind=='company':return {'id':company,'name':raw['CompanyName'],'sectorId':slug(raw['Sector']),**pick(profile or {},{'description':'Description','headquarters':'Headquarters','ceo':'ChiefExecutive','employees':'EmployeeCount','founded':'FoundedYear','website':'Website'})}
    if kind=='quote':
        out={'securityId':security,'symbol':s,'exchange':'NSE','timestamp':utc(raw['EventTimestamp']),'source':'live',**pick(raw,{'lastPrice':'LastTradedPrice','open':'Open','high':'High','low':'Low','previousClose':'PrevClose','change':'Change','changePercent':'ChangePct','volume':'Volume','bid':'Bid','ask':'Ask','currency':'Currency'})}
        if raw.get('MarketCapMn') is not None:
            if not finite(raw['MarketCapMn']):raise ValueError('invalid market capitalization')
            out['marketCap']=raw['MarketCapMn']*1000000
        if raw.get('TradingStatus') in STATUS:out['status']=STATUS[raw['TradingStatus']]
        return out
    if kind=='candle':
        out={'securityId':security,'timestamp':utc(raw['BarTime']),**pick(raw,{'open':'O','high':'H','low':'L','close':'C','volume':'V'})}
        if raw.get('Interval') in INTERVAL:out['interval']=INTERVAL[raw['Interval']]
        return out
    if kind=='financials':
        if raw.get('PeriodType') not in ('ANNUAL','QUARTERLY'):raise ValueError('statement period type unavailable')
        quarter=raw.get('FiscalQuarter');pid=f"NSE:period:{s}:{raw['FiscalYear']}"+(f'Q{quarter}' if quarter else '')
        period={'id':pid,'securityId':security,'periodType':'annual' if raw['PeriodType']=='ANNUAL' else 'quarterly',**pick(raw,{'fiscalYear':'FiscalYear','fiscalQuarter':'FiscalQuarter','periodEnd':'PeriodEndDate','reportedAt':'ReportedDate','currency':'Currency'})}
        fields={'income':{'revenue':'Revenue','costOfRevenue':'CostOfRevenue','grossProfit':'GrossProfit','operatingExpenses':'OperatingExpenses','operatingIncome':'OperatingIncome','netIncome':'NetIncome','eps':'EPS','dilutedEps':'DilutedEPS','ebitda':'EBITDA'},
                'balance':{'totalAssets':'TotalAssets','totalLiabilities':'TotalLiabilities','totalEquity':'TotalEquity','cash':'Cash','totalDebt':'TotalDebt','currentAssets':'CurrentAssets','currentLiabilities':'CurrentLiabilities','sharesOutstanding':'SharesOutstanding'},
                'cashFlow':{'operatingCashFlow':'OperatingCashFlow','investingCashFlow':'InvestingCashFlow','financingCashFlow':'FinancingCashFlow','freeCashFlow':'FreeCashFlow','capex':'Capex'}}
        return {'period':period,**{name:{'periodId':pid,**pick(raw,mapping)} for name,mapping in fields.items()}}
    if kind=='ownership':
        out={'securityId':security,**pick(raw,{'holderName':'HolderName','sharesHeld':'SharesHeld','percentHeld':'PercentHeld','asOf':'AsOfDate'})}
        types={'INSIDER':'insider','INSTITUTION':'institution','GOVERNMENT':'government','PUBLIC':'public','OTHER':'other'}
        if raw.get('HolderType') in types:out['holderType']=types[raw['HolderType']]
        return out
    if kind=='earnings':
        if not isinstance(identifier,str) or not identifier:raise ValueError('earnings identifier required')
        quarter=raw.get('FiscalQuarter');pid=f"NSE:period:{s}:{raw['FiscalYear']}"+(f'Q{quarter}' if quarter else '')
        return {'id':identifier,'securityId':security,'periodId':pid,**pick(raw,{'fiscalYear':'FiscalYear','fiscalQuarter':'FiscalQuarter','expectedDate':'ExpectedDate','reportedDate':'ReportedDate','epsEstimate':'EpsEstimate','epsActual':'EpsActual','revenueEstimate':'RevenueEstimate','revenueActual':'RevenueActual'})}
    if kind=='action':
        if not isinstance(identifier,str) or not identifier or not isinstance(raw.get('Payload'),dict):raise ValueError('action identifier/payload required')
        types={'DIVIDEND':'dividend','SPLIT':'split','BONUS':'bonus_issue','RIGHTS':'rights_issue','BUYBACK':'buyback','MERGER':'merger','ACQUISITION':'acquisition','SUSPENSION':'suspension','HALT':'trading_halt'}
        action=types.get(raw.get('ActionType'))
        if action is None:raise ValueError('unsupported action type')
        p=raw['Payload'];details={'type':action}
        def numeric(value):
            if isinstance(value,bool) or value is None:raise ValueError('literal numeric action payload required')
            n=float(value)
            if not finite(n):raise ValueError('finite action amount required')
            return n
        if action=='dividend':details.update({'amountPerShare':numeric(p.get('AmountPerShare')),'currency':p.get('Currency') or 'KES','dividendType':p.get('DividendType') or 'final'})
        elif action in ('split','bonus_issue'):details.update({'ratioFrom':numeric(p.get('RatioFrom') if p.get('RatioFrom') is not None else 1),'ratioTo':numeric(p.get('RatioTo') if p.get('RatioTo') is not None else 1)})
        elif action=='rights_issue':details.update({'ratio':str(p.get('Ratio') if p.get('Ratio') is not None else ''),'priceKes':numeric(p.get('PriceKes') if p.get('PriceKes') is not None else 0)})
        elif action=='buyback':
            for key,source in [('sharesTargeted','SharesTargeted'),('amount','Amount')]:
                if p.get(source) is not None:details[key]=numeric(p[source])
        elif action in ('merger','acquisition'):details.update({'counterparty':str(p.get('Counterparty') if p.get('Counterparty') is not None else ''),**pick(p,{'notes':'Notes'})})
        else:details.update(pick(p,{'reason':'Reason'}))
        if action=='dividend' and details['amountPerShare']<0:raise ValueError('negative dividend amount')
        return {'id':identifier,'securityId':security,'type':action,'details':details,'status':raw['Status'].lower(),**pick(raw,{'announcedAt':'AnnouncedDate','exDate':'ExDate','recordDate':'RecordDate','payDate':'PayDate','effectiveDate':'EffectiveDate'})}
    raise ValueError('unsupported literal feed mapping')

def map_fundamentals(security,profile,financials):
    return {'security':map_feed('security',security),'company':map_feed('company',security,profile),'sector':map_feed('sector',security),**map_feed('financials',financials)}

def map_nse_batch(kind,records):
    """Bounded adapter assembly, without transport, credentials or mock data."""
    if not isinstance(records,list) or len(records)>10000:raise ValueError('adapter_batch_limit')
    out=[]
    for index,row in enumerate(records):
        if not isinstance(row,dict):raise ValueError('adapter_record_required')
        if kind=='listing':
            security=map_feed('security',row)
            company={'id':security['companyId']};sector={}
            if isinstance(row.get('CompanyName'),str) and row['CompanyName'].strip(WHITESPACE):company['name']=row['CompanyName']
            if isinstance(row.get('Sector'),str) and row['Sector'].strip(WHITESPACE):
                sector=map_feed('sector',row);company['sectorId']=sector['id']
            # Sparse existing registrations are still discoverable. New issuer
            # creation separately requires real company/sector evidence; never
            # invent "Unknown" or ticker-as-company placeholder identities.
            out.append({'security':security,'company':company,'sector':sector})
        elif kind=='action':
            payload=row.get('Payload')
            if not isinstance(payload,dict):raise ValueError('literal_action_payload_required')
            required={'DIVIDEND':('AmountPerShare','Currency','DividendType'),'SPLIT':('RatioFrom','RatioTo'),
                      'BONUS':('RatioFrom','RatioTo'),'RIGHTS':('Ratio','PriceKes')}.get(row.get('ActionType'),())
            if any(payload.get(key) is None for key in required):raise ValueError('incomplete_action_payload')
            identifier=f"NSE:ca:{symbol(row)}:{row['ActionType']}:{row['AnnouncedDate']}:{index}"
            out.append(map_feed('action',row,identifier=identifier))
        elif kind=='earnings':
            identifier=f"NSE:earn:{symbol(row)}:{row['FiscalYear']}:{row.get('FiscalQuarter') or 0}:{index}"
            out.append(map_feed('earnings',row,identifier=identifier))
        elif kind=='candle':
            value=map_feed('candle',row)
            if row.get('SourceURL') is not None:value['sourceUrl']=row['SourceURL']
            out.append(value)
        elif kind=='quote':
            source=row.get('ObservationSource')
            if source not in ('live','delayed','eod'):raise ValueError('quote_source_classification_required')
            out.append({**map_feed('quote',row),'source':source})
        elif kind=='ownership':
            if any(not finite(row.get(key)) for key in ('SharesHeld','PercentHeld')) or not isinstance(row.get('AsOfDate'),str):
                raise ValueError('literal_dated_ownership_required')
            out.append(map_feed(kind,row))
        elif kind=='security':
            out.append(map_feed(kind,row))
        else:raise ValueError('unsupported_adapter_batch')
    return out

def map_nse_fundamentals(securities,profile,periods,ticker):
    if not isinstance(securities,list) or len(securities)>1000 or not isinstance(periods,list) or len(periods)>1000:
        raise ValueError('adapter_history_limit')
    security=next((row for row in securities if row.get('Symbol')==ticker),None)
    if security is None:return []
    result=[]
    for period in periods:
        if period.get('Symbol')!=ticker:raise ValueError('statement_issuer_mismatch')
        result.append(map_fundamentals(security,profile,period))
    return sorted(result,key=lambda row:row['period']['periodEnd'])

def normalize_fundamentals_bundle(bundle):
    """One bounded IPC operation; never coerce absent EPS/cash flow to zero."""
    if not isinstance(bundle,dict):raise ValueError('financial bundle required')
    required=('security','company','sector','period','income','balance','cashFlow')
    if any(not isinstance(bundle.get(key),dict) for key in required):raise ValueError('financial components required')
    out=dict(bundle)
    out['security']=normalize_feed('security',bundle['security'])
    out['company']=normalize_feed('company',bundle['company'])
    out['sector']={**bundle['sector'],'name':normalize_feed('sector',bundle['sector'])}
    income=dict(bundle['income'])
    for key in ('revenue','netIncome','eps','grossProfit'):
        if income.get(key) is not None:income[key]=rounded(income[key])
    if income.get('grossProfit') is None and income.get('revenue') is not None and income.get('costOfRevenue') is not None:
        income['grossProfit']=rounded(income['revenue']-income['costOfRevenue'])
    out['income']=income
    out['cashFlow']=normalize_feed('cashflow',bundle['cashFlow'])
    for component in ('income','balance','cashFlow'):
        for key,value in out[component].items():
            if key!='periodId' and value is not None and not finite(value):raise ValueError('literal financial value required')
    balance=out['balance']
    if any(not finite(balance.get(key)) for key in ('totalAssets','totalLiabilities','totalEquity')):
        raise ValueError('balance evidence required')
    if not normalize_feed('balance-integrity',balance)['ok']:raise ValueError('balance requires review')
    return out

def normalize_feed(kind,row):
    out=dict(row)
    if kind=='price':
        price,previous=rounded(row['lastPrice']),rounded(row['previousClose']);change=rounded(price-previous)
        out.update({'lastPrice':price,'previousClose':previous,'change':change,'changePercent':rounded(change/previous*100) if previous!=0 else 0,
            'open':rounded(row['open']),'high':rounded(max(row['high'],row['open'],price)),
            'low':rounded(min(row['low'],row['open'],price) if row['low']>0 else min(row['open'],price)),
            'volume':max(0,math.floor(row['volume']+.5)),'symbol':row['symbol'].strip(WHITESPACE).upper()})
        for field in ('bid','ask'):
            if row.get(field) is not None:out[field]=rounded(row[field])
            else:out.pop(field,None)
        return out
    if kind=='index':
        value,previous=rounded(row['value']),rounded(row['previousClose']);change=rounded(value-previous)
        return {**out,'value':value,'previousClose':previous,'change':change,'changePercent':rounded(change/previous*100) if previous!=0 else 0,'code':row['code'].strip(WHITESPACE).upper()}
    if kind=='income':
        for field in ('revenue','netIncome','eps'):out[field]=rounded(row[field])
        if row.get('grossProfit') is not None:out['grossProfit']=rounded(row['grossProfit'])
        elif row.get('costOfRevenue') is not None:out['grossProfit']=rounded(row['revenue']-row['costOfRevenue'])
        else:out.pop('grossProfit',None)
        return out
    if kind=='cashflow':
        if row.get('operatingCashFlow') is not None:out['operatingCashFlow']=rounded(row['operatingCashFlow'])
        else:out.pop('operatingCashFlow',None)
        if row.get('freeCashFlow') is not None:out['freeCashFlow']=rounded(row['freeCashFlow'])
        elif row.get('capex') is not None and row.get('operatingCashFlow') is not None:out['freeCashFlow']=rounded(row['operatingCashFlow']-row['capex'])
        else:out.pop('freeCashFlow',None)
        return out
    if kind=='balance-integrity':
        delta=abs(row['totalAssets']-(row['totalLiabilities']+row['totalEquity']));percent=delta/row['totalAssets']*100 if row['totalAssets'] else 0
        return {'ok':percent<=2,'deltaPercent':rounded(percent)}
    if kind=='company':
        for key in ('name','description','headquarters'):
            if row.get(key) is not None:out[key]=row[key].strip(WHITESPACE)
            else:out.pop(key,None)
        return out
    if kind=='security':return {**out,'symbol':row['symbol'].strip(WHITESPACE).upper()}
    if kind=='sector':
        name=row['name'].strip(WHITESPACE)
        return next((s for s in SECTORS if s.lower()==name.lower()),name)
    raise ValueError('unsupported feed normalization')
