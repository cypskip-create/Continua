"""Deterministic cited evidence reader. Never calls a generative provider."""
import re
from decimal import Decimal,ROUND_HALF_UP,localcontext
from .numbers import finite
from .evidence_json import number_text

def obj(v):return v if isinstance(v,dict) else {}
def strings(v):return [s for s in v if isinstance(s,str)][:6] if isinstance(v,list) else []
def text(v):
    if v is None:return 'null'
    if isinstance(v,bool):return 'true' if v else 'false'
    if finite(v):return number_text(v)
    return str(v)
def fixed(v,digits):
    if abs(v)>=1e21:return number_text(v)
    with localcontext() as c:
        c.prec=350
        magnitude=Decimal.from_float(abs(float(v))).quantize(Decimal(1).scaleb(-digits),rounding=ROUND_HALF_UP)
        return ('-' if v<0 else '')+format(magnitude,f'.{digits}f')
def slice_text(value,limit):return value.encode('utf-16-le',errors='surrogatepass')[:limit*2].decode('utf-16-le',errors='surrogatepass')

def calculated_answer(question,evidence):
    if not evidence:raise ValueError('verified evidence required')
    q=question.lower();topics={'revenueGrowth':['revenue','growth'],'earningsGrowth':['earnings','profit','growth'],'cashConversion':['cash','quality'],'debtToEquity':['debt','leverage','risk'],'returnOnAssets':['return on assets','roa'],'currentRatio':['liquidity','current ratio']}
    selected=[k for k,words in topics.items() if any(w in q for w in words)];blocks=[];citations=[]
    for e in evidence:
        f=obj(e.get('facts'));lines=[];identity=e['id']
        if identity.endswith(':company'):
            financial=obj(f.get('financial'));metrics=obj(financial.get('metrics'));brief=obj(f.get('briefing'))
            for key in selected or topics:
                n=metrics.get(key);value=fixed(n*100 if key=='returnOnAssets' else n,2)+('%' if 'Growth' in key or key=='returnOnAssets' else ' ×') if finite(n) else 'Unavailable'
                label=re.sub(r'([A-Z])',r' \1',key);period=financial.get('period')
                lines.append(f"{label}: {value} (FY {text(period) if period is not None else 'unknown'}).")
            if re.search('risk|change|quality',q):lines+=strings(brief.get('risks'))+strings(financial.get('findings'))+strings(obj(f.get('quality')).get('warnings'))
            if re.search('quality|cash|evidence|check',q):
                checks=obj(f.get('diagnostics')).get('checks',[])
                for check in checks[:6] if isinstance(checks,list) else []:
                    c=obj(check);result='met' if c.get('result')=='pass' else 'review' if c.get('result')=='flag' else 'unknown'
                    lines.append(f"{c.get('label','undefined')}: {result}. {c.get('reason') or ''}")
            if 'scenario' in q and isinstance(f.get('scenarios'),list):
                for scenario in f['scenarios'][:3]:
                    v=obj(scenario);lines.append(f"{v.get('name','undefined')}: illustrative growth {text(v.get('growthPercent','undefined'))}%; revenue {text(v['revenue']) if v.get('revenue') is not None else 'unavailable'}; net income {text(v['netIncome']) if v.get('netIncome') is not None else 'unavailable'}. {v.get('assumption') or ''}")
            if re.search('missing|coverage',q):lines+=strings(f.get('missing'))
        elif identity=='portfolio':
            positions=f.get('positions')
            if isinstance(positions,list):
                for p in sorted(positions,key=lambda p:obj(p).get('weight') or 0,reverse=True)[:5]:
                    v=obj(p);weight=fixed(v['weight']*100,1)+'%' if finite(v.get('weight')) else 'unavailable'
                    lines.append(f"{v.get('symbol','undefined')}: {weight} portfolio weight; valued {v.get('asOf') or 'date unavailable'}.")
            lines+=strings(f.get('warnings'))
            if isinstance(f.get('coverage'),str):lines.append('Coverage: '+f['coverage']+'.')
            if re.search('risk|volatil|loss|drawdown',q):
                risk=obj(f.get('risk'));a=obj(obj(risk.get('metrics')).get('attribution'))
                lines.append(f"Risk coverage: {text(risk.get('observations',0))} aligned observations. {risk.get('reason') or ''}")
                contributions=a.get('contributions')
                for c in contributions[:10] if isinstance(contributions,list) else []:
                    c=obj(c)
                    if finite(c.get('riskShare')):lines.append(f"{c.get('symbol','undefined')}: {fixed(c['riskShare']*100,1)}% of measured variance, not capital or guaranteed future risk.")
                lines.append(f"Historical 1-day VaR (95%): {text(a['historicalVaR95']) if a.get('historicalVaR95') is not None else 'unavailable'}%; expected shortfall (95%): {text(a['expectedShortfall95']) if a.get('expectedShortfall95') is not None else 'unavailable'}%. Both are backward-looking, not maximum loss.")
            if re.search('return|performance',q):
                p=obj(f.get('performance'));lines.append(f"Recorded time-weighted return: {text(p['twr']) if p.get('twr') is not None else 'unavailable'}%; money-weighted return: {text(p['moneyWeighted']) if p.get('moneyWeighted') is not None else 'unavailable'}%. {p.get('reason') or ''}")
        elif ':news:' in identity and re.search('news|change|risk',q):
            if isinstance(f.get('summary'),str):lines.append(slice_text(f['summary'],1000))
        elif identity.endswith(':technical') and re.search('technical|trend|momentum|price',q):
            observations=f.get('observations')
            for item in observations[:6] if isinstance(observations,list) else []:
                v=obj(item)
                if isinstance(v.get('text'),str):lines.append(f"{v.get('topic','undefined')}: {v['text']}")
        if lines:
            blocks.append(e['title']+' · '+(e.get('asOf') or 'date unavailable')+'\n'+'\n'.join('• '+line for line in lines));citations.append(identity)
    if not citations:
        citations.append(evidence[0]['id']);blocks.append('The selected evidence does not cover this question. Try revenue growth, earnings quality, debt, portfolio concentration, news or technical observations.')
    return {'answer':slice_text('Calculated evidence briefing — no generative AI used.\n\n'+'\n\n'.join(blocks),12000),'citations':citations,'limitations':['This mode reads reported fields and cannot answer arbitrary questions, infer causation or predict returns.','Compare reporting dates and missing coverage; this is research, not a personal trade instruction.'],'sources':[next(e for e in evidence if e['id']==identity) for identity in citations],'cached':False}

def assistant_answer(question,companies,portfolio,now):
    return calculated_answer(question,assistant_evidence(companies,portfolio,now))

def assistant_evidence(companies,portfolio,now):
    evidence=[]
    if portfolio is not None:
        keys=['positions','sectors','warnings','performance','correlations','risk','dividends','researchBriefing','coverage','methodology']
        evidence.append({'id':'portfolio','title':'Your portfolio research','asOf':now,'url':None,'facts':{k:portfolio[k] for k in keys if k in portfolio}})
    else:
        pairs=companies.items() if isinstance(companies,dict) else ((item['symbol'],item['bundle']) for item in companies)
        for symbol,b in pairs:
            quality=b.get('quality') or {};diagnostics=b.get('diagnostics') or {};trends=diagnostics.get('trends') or []
            urls=(trends[-1].get('sourceUrls') or []) if trends else []
            filing=next((u for u in urls if isinstance(u,str) and re.match('https://',u,re.I)),None)
            facts={'briefing':b.get('briefing'),'quality':quality,'financial':b.get('financialAnalysis'),'diagnostics':diagnostics,'valuation':(b.get('valuation') or {}).get('models'),'scenarios':b.get('scenarios'),'missing':b.get('unavailable')}
            evidence.append({'id':symbol+':company','title':b['companyName']+' financial analysis','asOf':quality.get('filedAt'),'url':filing,'facts':facts})
            evidence.append({'id':symbol+':technical','title':symbol+' dated technical observations','asOf':(b.get('quote') or {}).get('timestamp'),'url':None,'facts':b.get('synthesis')})
            for n in b.get('news',[])[:4]:
                evidence.append({'id':symbol+':news:'+text(n['id']),'title':n['headline'],'asOf':n.get('publishedAt'),'url':n['url'] if re.match(r'https?://',n.get('url',''),re.I) else None,'facts':{'summary':n.get('summary'),'methodology':n.get('methodology')}})
    return evidence

def validate_assistant_answer(value,evidence):
    if not isinstance(value,dict) or set(value)!={'answer','citations','limitations'}:
        raise ValueError('Invalid assistant response')
    answer,citations,limitations=(value[k] for k in ('answer','citations','limitations'))
    length=lambda text:len(text.encode('utf-16-le',errors='surrogatepass'))//2
    if not isinstance(answer,str) or not 1<=length(answer)<=12000:
        raise ValueError('Invalid assistant answer length')
    if not isinstance(citations,list) or not 1<=len(citations)<=20 or not all(isinstance(identity,str) for identity in citations):
        raise ValueError('Invalid assistant citations')
    if not isinstance(limitations,list) or len(limitations)>12 or not all(isinstance(item,str) for item in limitations):
        raise ValueError('Invalid assistant limitations')
    sources={item['id']:item for item in evidence}
    if any(identity not in sources for identity in citations):
        raise ValueError('Assistant cited an unknown source')
    return {**value,'sources':[sources[identity] for identity in citations]}
