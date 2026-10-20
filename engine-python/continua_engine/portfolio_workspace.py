"""Portfolio workspace assembly from owned holdings and actual dated evidence."""
from .portfolio import portfolio_analysis,aligned_returns,performance
from .risk import portfolio_risk
from .risk_intelligence import build_risk_intelligence
from .dividends import trailing_dividend_per_share
from .dates import parse
from .numbers import finite

def snapshot_plan(positions,now):
    analysis=portfolio_analysis(positions);current=parse(now)
    if current is None:raise ValueError('invalid snapshot date')
    complete=bool(positions) and analysis['available'] and current is not None and positions[0].get('currency')=='KES'
    for p in positions:
        at=parse(p.get('asOf'))
        if not finite(p.get('price')) or p['price']<=0 or not finite(p.get('shares')) or p['shares']<=0 or at is None or at>current or (current-at).total_seconds()>=7*86400:
            complete=False
    dates={p.get('asOf','')[:10] if p.get('asOf') else None for p in positions}
    complete=complete and len(dates)==1 and None not in dates
    return {'complete':complete,'currency':positions[0].get('currency') if positions else None,'sessionDate':next(iter(dates)) if complete else None,'totalValue':analysis['totalValue'] if complete else None,'selectedSymbols':[p['symbol'] for p in analysis['positions'][:20]] if analysis['available'] else []}

def portfolio_workspace(data,now):
    positions=data['positions'];analysis=portfolio_analysis(positions)
    snapshots=[dict(s) for s in data.get('snapshots',[])];period_flows=data.get('periodFlows',[])
    for i,s in enumerate(snapshots):
        if i>0:s['flow']=sum(f['amount'] for f in period_flows if snapshots[i-1]['date']<f['date']<=s['date'])
    histories=data.get('histories',[])
    series={h['symbol']:h['bars'] for h in histories if len(h['bars'])>=21} if analysis['available'] else {}
    weights={p['symbol']:p['weight'] for p in analysis['positions']}
    dividends=[]
    by_symbol={p['symbol']:p for p in positions}
    for item in data.get('dividends',[]):
        p=by_symbol[item['symbol']];actions=item.get('actions',[])
        dps=trailing_dividend_per_share(actions,now)
        upcoming=[{'date':a['payDate'],'amount':a['details']['amountPerShare']*p['shares']} for a in actions if a.get('status')!='cancelled' and a.get('details',{}).get('type')=='dividend' and a.get('payDate') and a['payDate']>now[:10]]
        dividends.append({'symbol':p['symbol'],'trailingIncome':dps*p['shares'] if dps is not None else None,'upcoming':upcoming})
    eligible=analysis['positions'] if analysis['available'] else []
    company_data=data.get('companies',{});companies=[];news=[];covered=0
    for p in eligible[:20]:
        b=company_data.get(p['symbol']);b=b if isinstance(b,dict) else None
        if b is not None:covered+=1
        financial=(b or {}).get('financialAnalysis') or {};brief=(b or {}).get('briefing') or {};quality=(b or {}).get('quality') or {};changes=(b or {}).get('changes') or {}
        companies.append({'symbol':p['symbol'],'weight':p['weight'],'period':financial.get('period'),'metrics':financial.get('metrics',{}),'findings':financial.get('findings',[]),'sectorNote':financial.get('sectorNote'),'facts':brief.get('facts',[]),'risks':brief.get('risks',[]),'qualityWarnings':quality.get('warnings',[]),'unavailable':b.get('unavailable',[]) if b else ['Company research'],'changes':changes.get('changes',[])})
        news.extend({**n,'symbol':p['symbol']} for n in (b or {}).get('news',[])[:2])
    news.sort(key=lambda n:n.get('publishedAt') or '',reverse=True)
    persistence=data.get('persistenceAvailable',False)
    if not persistence:analysis['warnings'].append('Snapshot or cash-flow storage is unavailable. Holdings remain available; invested returns are withheld until storage recovers.')
    intelligence=build_risk_intelligence(positions,histories,now)
    return {**analysis,'currency':next((p.get('currency') for p in positions if p.get('price') is not None),None),'correlations':{'dates':intelligence['sampleDates'],'pairs':intelligence['pairs'],'methodology':intelligence['evidence']['returnConvention']},'risk':intelligence['legacyRisk'],'riskIntelligence':intelligence,
        'researchBriefing':{'covered':covered,'requested':len(eligible),'limit':20,'companies':companies,'news':news[:10],'methodology':'Financial findings remain company-specific and retain fiscal periods. Research covers up to 20 highest-value priced holdings. No weighted valuation ratios or analyst forecasts are invented.'},
        'dividends':dividends,'performance':performance(snapshots,period_flows) if persistence else {'twr':None,'moneyWeighted':None,'reason':'Snapshot and cash-flow storage must recover before returns can be calculated.'},'snapshots':snapshots,'flows':data.get('flows',[]),
        'methodology':'Latest-session contribution uses current share counts and quote changes. Snapshot returns describe recorded invested holdings, not brokerage total return; external flows must be entered, and cash balances are excluded.',
        'historyWarnings':(['Dividend detail covers at most twenty holdings with prices.'] if len(positions)>20 else [])+[h['symbol']+': correlation excluded because corporate-action adjustment basis is unverified.' for h in histories if h.get('blocked')]}
