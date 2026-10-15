"""Narrow source-layout validators. Ambiguous/OCR/mixed statements fail closed."""
import re
import math
from datetime import date
from .publisher import issuer_masthead_matches
from .publication import validate_historical_confirmation

NATIVE_ANNUAL_VERSION='consolidated-native-annual-v1'
MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december']
DATE_PATTERN=r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})'

def report_date(day,month,year):
    try:return date(int(year),MONTHS.index(month.lower())+1,int(day)).isoformat()
    except ValueError:raise ValueError('Invalid report date') from None

def report_number(value):
    if not re.fullmatch(r'(?:\(\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?)',value):raise ValueError('Incomplete numeric cell')
    result=float(re.sub(r'[(),]','',value))*(-1 if value.startswith('(') else 1)
    if not math.isfinite(result):raise ValueError('Invalid numeric cell')
    return result

def confirmation(body):
    result=validate_historical_confirmation(body)
    if not result['valid']:raise ValueError('Invalid reviewed financial columns')
    return result['data']

def native_annual_report(text,issuer,security_id):
    normalize=lambda v:re.sub(r'[^a-z0-9]','',v.lower())
    header=text.encode('utf-16-le',errors='surrogatepass')[:8000].decode('utf-16-le',errors='surrogatepass')
    if not issuer or (not issuer_masthead_matches(text,issuer) and normalize(issuer) not in normalize(header)):raise ValueError('Exact issuer identity missing from report header')
    approvals=list(re.finditer(r'(?:approved|authorised)\s+(?:by[^\n]{0,100}\s+)?(?:for issue\s+)?on\s+'+DATE_PATTERN,text,re.I))
    report_dates=list(dict.fromkeys(report_date(*v.groups()) for v in approvals))
    if len(report_dates)!=1:raise ValueError('Unique approval date required')
    reported_at=report_dates[0];entries=[]
    for page_index,page in enumerate(text.split('\f')):
        headings=list(re.finditer(r'^\s*CONSOLIDATED STATEMENT OF (PROFIT OR LOSS|COMPREHENSIVE INCOME|FINANCIAL POSITION|CASH FLOWS)[^\n]*$',page,re.I|re.M))
        for h,heading in enumerate(headings):
            block=page[heading.start():headings[h+1].start() if h+1<len(headings) else len(page)]
            lines=[line.strip() for line in re.split(r'\r?\n',block)]
            intro=' '.join(lines[:12])
            if re.search(r'\b(?:company|bank)\s+(?:group|20\d{2})|\b(?:quarter|six months|half.year|unaudited)\b',intro,re.I):raise ValueError('Mixed scope or interim columns require review')
            period=re.search(r'(?:for the year ended|as at)\s+'+DATE_PATTERN,block,re.I)
            if not period:raise ValueError('Exact annual end date required')
            units=[]
            for line in lines[:12]:
                match=re.search(r"\b(?:KES|KShs?\.?|Shs\.?)\s*(['’]?000|million|billion)\b",line,re.I)
                if match:units.append(re.sub("['’]",'',match[1]).lower())
            units=list(dict.fromkeys(units))
            if len(units)!=1 or re.search(r'\b(?:USD|US\$|UGX|TZS|GBP)\b',intro):raise ValueError('Unique KES units required')
            multiplier={'000':1000,'million':1e6,'billion':1e9}[units[0]]
            headers=[line for line in lines if re.fullmatch(r'(?:Notes?\s+)?20\d{2}(?:\s+20\d{2}){0,3}',line)]
            if len(headers)!=1:raise ValueError('Aligned single year header required')
            header=headers[0];has_notes=bool(re.match(r'^Notes?\s',header));years=re.findall(r'20\d{2}',header)
            if years[0]!=period[3] or len(set(years))!=len(years) or any(int(y)<2015 or int(y)>int(period[3]) for y in years):raise ValueError('Annual columns do not match the dated heading')
            rows=[]
            for line in lines:
                cells=re.split(r'\s{2,}',line)
                if len(cells)<2 or not re.search('[a-z]',cells[0],re.I):continue
                values=cells[1:]
                if has_notes and len(values)==len(years)+1 and re.fullmatch(r'\d{1,3}',values[0]):values=values[1:]
                if len(values)==len(years) and all(re.fullmatch(r'\(?-?\d[\d,]*(?:\.\d+)?\)?',v) for v in values):rows.append({'label':cells[0],'values':values})
            def find(pattern):
                matches=[row for row in rows if re.fullmatch(pattern,row['label'],re.I)]
                if len(matches)!=1:raise ValueError('Missing or duplicate accounting label')
                return [report_number(v) for v in matches[0]['values']]
            type='balance' if heading[1].upper()=='FINANCIAL POSITION' else 'cashflow' if heading[1].upper()=='CASH FLOWS' else 'income'
            mapped={}
            if type=='balance':
                mapped={'totalAssets':find('Total assets'),'totalLiabilities':find('Total liabilities'),'totalEquity':find(r"Total (?:equity|shareholders['’]? funds)")}
                if any(mapped['totalAssets'][i]<=0 or abs(mapped['totalAssets'][i]-mapped['totalLiabilities'][i]-mapped['totalEquity'][i])>3 for i in range(len(years))):raise ValueError('Balance totals fail rounding-level check')
            elif type=='income':
                mapped={'revenue':find(r'(?:Revenue|Total operating income)'),'netIncome':find(r'(?:Profit|Loss|Profit/\(loss\)) (?:after tax|for the year)'),
                    'eps':find(r'(?:Basic )?Earnings per share \((?:KES|KShs?\.?)\)')}
                before,tax=find('Profit before tax'),find('Income tax expense')
                if any(mapped['revenue'][i]<=0 or abs(before[i]-abs(tax[i])-mapped['netIncome'][i])>3 for i in range(len(years))):raise ValueError('Income tax reconciliation failed')
            else:
                mapped={field:find(r'Net cash (?:generated from|used in|from) '+activity+' activities') for field,activity in [('operatingCashFlow','operating'),('investingCashFlow','investing'),('financingCashFlow','financing')]}
                change=find(r'Net (?:increase|decrease|increase/\(decrease\)) in cash and cash equivalents')
                if any(abs(sum(values[i] for values in mapped.values())-change[i])>3 for i in range(len(years))):raise ValueError('Cash-flow reconciliation failed')
            body={'securityId':security_id,'statementType':type,'unitsVerified':True,'periods':[{'columnIndex':i,
                'period':{'periodType':'annual','fiscalYear':int(year),'periodEnd':report_date(period[1],period[2],year),'reportedAt':reported_at,'currency':'KES'},
                type:{field:values[i]*(1 if field=='eps' else multiplier) for field,values in mapped.items()},'sourcePage':page_index+1,
                'note':f'Automatic {NATIVE_ANNUAL_VERSION}: exact issuer, consolidated annual scope, dated columns, KES {units[0]}, approval date and accounting reconciliation. EPS is unscaled.'} for i,year in enumerate(years)]}
            entries.append({'table':{'title':heading[0].strip(),'headerLine':header,'rows':rows,'method':NATIVE_ANNUAL_VERSION,'confidence':1},'confirmation':confirmation(body)})
    if not entries:raise ValueError('Unsupported native financial layout')
    keys=[(entry['confirmation']['statementType'],p['period']['fiscalYear']) for entry in entries for p in entry['confirmation']['periods']]
    if len(set(keys))!=len(keys):raise ValueError('Duplicate statements require review')
    return entries
