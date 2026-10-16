"""Literal publisher fields for UI research, not canonical filing approval.

Exact labels only. Unknowns and conflicting disclosures are not inferred. No
forecast, filing date, holder classification or accounting scope is invented.
"""
import re

def key(label):
    return re.sub('[^a-z0-9]','',label.lower())

LABELS={
 'revenue':'revenue','totalrevenue':'revenue',
 'netincome':'netIncome','netprofit':'netIncome','totalprofitloss':'netIncome','profitaftertax':'netIncome',
 'eps':'eps','earningspershare':'eps','basicearningspershare':'eps',
 'totalassets':'totalAssets','totalliabilities':'totalLiabilities',
 'totalequity':'totalEquity','totalshareholdersequity':'totalEquity',
 'currentassets':'currentAssets','totalcurrentassets':'currentAssets',
 'currentliabilities':'currentLiabilities','totalcurrentliabilities':'currentLiabilities',
 'cashandcashequivalents':'cash','totaldebt':'totalDebt','sharesoutstanding':'sharesOutstanding',
 'operatingprofit':'operatingIncome','operatingincome':'operatingIncome','ebit':'operatingIncome',
 'ebitda':'ebitda','grossprofit':'grossProfit',
 'operatingexpensestotal':'operatingExpenses','costofrevenue':'costOfRevenue',
 'cashgeneratedfromoperatingactivitiestotal':'operatingCashFlow','netcashfromoperatingactivities':'operatingCashFlow',
 'cashusedininvestingactivitiestotal':'investingCashFlow','netcashusedininvestingactivities':'investingCashFlow',
 'cashusedinfinancingactivitiestotal':'financingCashFlow','netcashfromfinancingactivities':'financingCashFlow',
 'freecashflow':'freeCashFlow',
}

def annotate_publisher_context(result):
    result['presentationVersion']=2
    fields=[]
    for series in result.get('charts',[]):
        metric=LABELS.get(key(series.get('label','')))
        if metric and series.get('unit') in ('reported','KES'):
            for point in series.get('points',[]):
                if type(point.get('year')) is int and point.get('value') is not None:
                    fields.append({'metric':metric,'year':point['year'],'value':point['value'],
                        'raw':point.get('raw'),'sourceLabel':series['label'],'basis':'publisher_observation'})
    result['financialFields']=fields
    ownership=[]
    if result.get('destination')=='ownership':
        for table in result.get('tables',[]):
            headers=[key(c) for c in table.get('columns',[])]
            percent=next((i-1 for i,c in enumerate(headers) if i>0 and c in ('ownership','ownershippercent','ownershippercentage')),None)
            shares=next((i-1 for i,c in enumerate(headers) if i>0 and c in ('shares','sharesheld')),None)
            if percent is None:continue
            for row in table.get('rows',[]):
                numbers=row.get('numbers',[])
                p=numbers[percent] if percent<len(numbers) else None
                n=numbers[shares] if shares is not None and shares<len(numbers) else None
                if not p or not 0<=p['value']<=100:continue
                ownership.append({'securityId':'NSE:'+result.get('symbol',''),'holderName':row['label'],'percentHeld':p['value'],
                    'sharesHeld':n['value'] if n and n['value']>=0 else None,
                    'sharesApproximate':bool(n and n.get('approximate')),'holderType':'other',
                    'asOf':None,'basis':'publisher_observation'})
    names=[key(r['holderName']) for r in ownership]
    result['ownership']=ownership if len(names)==len(set(names)) and sum(r['percentHeld'] for r in ownership)<=100.05 else []
    return result
