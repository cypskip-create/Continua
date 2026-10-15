"""Snapshot breadth only, not trade-tape or intraday anomaly assertions."""
from .numbers import finite

def analyse_market(rows):
    if not isinstance(rows,list) or len(rows)>2000: raise ValueError('market snapshot limit')
    valid=[r for r in rows if finite(r.get('changePercent'))]
    labels=['≤−7%','−7–−5%','−5–−3%','−3–0%','0%','0–3%','3–5%','5–7%','≥7%']
    counts=[0]*9
    for r in valid:
        v=r['changePercent']
        index=4 if v==0 else next(i for i,b in enumerate([-7,-5,-3,0]) if v<=b) if v<0 else 5 if v<3 else 6 if v<5 else 7 if v<7 else 8
        counts[index]+=1
    names=list(dict.fromkeys(r.get('sector') if r.get('sector') is not None else 'Other' for r in valid))
    sectors=[]
    for name in names:
        members=[r for r in valid if (r.get('sector') if r.get('sector') is not None else 'Other')==name]
        total=0
        for r in members: total+=r['changePercent']
        sectors.append({'name':name,'changePercent':total/len(members),'coverage':len(members),'symbols':[r['symbol'] for r in members]})
    sectors.sort(key=lambda r:-r['changePercent'])
    monitor=sorted(valid,key=lambda r:-abs(r['changePercent']))[:20]
    return {'coverage':len(valid),'advancing':sum(r['changePercent']>0 for r in valid),'declining':sum(r['changePercent']<0 for r in valid),
        'unchanged':sum(r['changePercent']==0 for r in valid),'distribution':[{'label':label,'count':counts[i]} for i,label in enumerate(labels)],
        'sectors':sectors,'monitor':[{**r,'signal':'Large session move' if abs(r['changePercent'])>=5 else 'Session movement'} for r in monitor],
        'methodology':'Equal-weight sector returns; latest published quote per issuer. Snapshot movements, not block trades or intraday volume anomalies.'}
