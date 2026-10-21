"""Literal, review-only statement extensions with explicit units and cell lineage.

No heuristic year/currency/consolidation guess can promote a financial fact.
The existing core-statement approval workflow remains authoritative.
"""
import math
import re
from datetime import date
from urllib.parse import urlsplit

FIELDS={
 'revenue':('revenue','turnover','net sales'),
 'costOfSales':('cost of sales','cost of revenue'),
 'grossProfit':('gross profit',), 'operatingProfit':('operating profit','operating income'),
 'financeCosts':('finance costs','finance cost'), 'profitBeforeTax':('profit before tax',),
 'netIncome':('profit after tax','profit for the year','net income'),
 'eps':('earnings per share','basic earnings per share'),
 'cash':('cash and cash equivalents',), 'receivables':('trade receivables',),
 'inventories':('inventories',), 'currentAssets':('current assets','total current assets'),
 'totalAssets':('total assets',), 'shortTermBorrowings':('short term borrowings','current borrowings'),
 'longTermBorrowings':('long term borrowings','non current borrowings'),
 'totalLiabilities':('total liabilities',), 'equity':('total equity','total shareholders equity'),
 'leaseLiabilities':('lease liabilities',),
 'operatingCashFlow':('net cash from operating activities','net cash generated from operating activities'),
 'investingCashFlow':('net cash from investing activities','net cash used in investing activities'),
 'financingCashFlow':('net cash from financing activities','net cash used in financing activities'),
 'capex':('capital expenditure','purchase of property plant and equipment'),
 'bankNetInterestIncome':('net interest income',),
 'bankLoans':('loans and advances to customers','net loans and advances'),
 'bankDeposits':('customer deposits','deposits from customers'),
 'bankNPL':('non performing loans','gross non performing loans'),
 'bankProvisions':('loan loss provisions','expected credit losses'),
 'bankNPLRatio':('npl ratio','non performing loan ratio'),
 'bankCoreCapitalRatio':('core capital ratio',), 'bankTotalCapitalRatio':('total capital ratio',),
 'bankLiquidityRatio':('liquidity ratio',),
 'insuranceRevenue':('insurance revenue',), 'insuranceServiceResult':('insurance service result',),
 'insuranceInvestmentIncome':('investment income',),
 'insuranceContractLiabilities':('insurance contract liabilities',),
 'insuranceSolvencyCoverage':('solvency coverage ratio','solvency ratio'),
 'foreignCurrencyDebt':('foreign currency borrowings','foreign currency debt'),
}
RATIOS={'bankNPLRatio','bankCoreCapitalRatio','bankTotalCapitalRatio','bankLiquidityRatio','insuranceSolvencyCoverage'}


def label(value):
    return ' '.join(re.sub(r"[^a-z0-9 ]",' ',str(value).lower()).split())


def literal_number(raw):
    if not isinstance(raw,str):return None
    text=raw.strip().replace('\u2212','-')
    negative=text.startswith('(') and text.endswith(')')
    if negative:text=text[1:-1].strip()
    if not re.fullmatch(r'[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?',text):return None
    if negative and text.startswith(('+','-')):return None
    value=float(text.replace(',',''))
    return (-value if negative else value) if math.isfinite(value) else None


def financial_extensions(p):
    metadata=p['metadata'];rows=p['rows'];periods=metadata['periods']
    if not isinstance(rows,list) or len(rows)>2000 or not 1<=len(periods)<=20:
        raise ValueError('Extension tables support at most 2,000 rows and 20 explicit fiscal columns.')
    scale=metadata['scale'];currency=metadata['currency'];basis=metadata['basis']
    source=urlsplit(metadata['sourceUrl'])
    if source.scheme!='https' or not source.hostname or source.username or source.password:raise ValueError('HTTPS source evidence required.')
    if isinstance(scale,bool) or scale not in (1,1000,1000000,1000000000) or not re.fullmatch('[A-Z]{3}',currency) or basis not in ('consolidated','company'):
        raise ValueError('Explicit currency, scale and consolidated/company basis are required.')
    for period in periods:
        date.fromisoformat(period['periodEnd'])
        if period.get('availableAt'):date.fromisoformat(period['availableAt'])
    output=[];seen=set();conflicts=[]
    for index,row in enumerate(rows):
        normalized=label(row['label'])
        field=next((key for key,names in FIELDS.items() if normalized in names),None)
        segment=row.get('segment')
        if field is None and segment and normalized in ('segment revenue','segment operating profit'):
            field='segmentRevenue' if normalized=='segment revenue' else 'segmentOperatingProfit'
        if not field:continue
        for column,period in enumerate(periods):
            raw=row['values'][column] if column<len(row['values']) else None
            unit=row.get('unit','currency')
            if field in RATIOS:
                percent=isinstance(raw,str) and raw.strip().endswith('%')
                value=literal_number(raw.strip()[:-1] if percent else raw)
                if value is not None:value=value/100 if percent or unit=='percent' else value if unit=='decimal' else None
                observed_unit='decimal'
            else:
                value=literal_number(raw)
                if field=='eps':
                    if unit!='currency_per_share':value=None
                    observed_unit=currency+' per share'
                else:
                    value=value*scale if value is not None else None
                    observed_unit=currency
            key=(field,column,segment)
            if key in seen:conflicts.append(dict(field=field,column=column,reason='Multiple source rows; neither is selected as canonical.'))
            seen.add(key)
            output.append(dict(field=field,column=column,period=period,value=value,raw=raw,unit=observed_unit,
                currency=currency,scale=scale,basis=basis,segment=segment,
                lineage=dict(sourceUrl=metadata['sourceUrl'],documentId=metadata['documentId'],page=row.get('page'),
                    table=metadata['tableId'],row=index,column=column,parserVersion='financial-extension-v1'),
                missingReason='Ambiguous source cell/unit; requires review' if value is None else None))
    reconciliations=[]
    for column in range(len(periods)):
        values={r['field']:r['value'] for r in output if r['column']==column and r['segment'] is None}
        if all(values.get(k) is not None for k in ('totalAssets','totalLiabilities','equity')):
            residual=values['totalAssets']-values['totalLiabilities']-values['equity']
            reconciliations.append(dict(column=column,identity='assets = liabilities + equity',residual=residual,
                reconciled=abs(residual)<=max(scale,abs(values['totalAssets'])*1e-6)))
    return dict(observations=output,conflicts=conflicts,reconciliations=reconciliations,status='requires-review',
        methodology='Literal exact-label mapping with explicit fiscal columns, currency, scale and consolidation basis. Parentheses preserve negatives. Source cells and conflicting rows remain separate. EPS is never multiplied by statement scale; ratio units must be explicit. Banking deposits are not mapped to industrial debt; IFRS 17 insurance service results are distinct from premiums. No canonical statement, publication date, segment category or foreign-currency exposure is guessed.')
