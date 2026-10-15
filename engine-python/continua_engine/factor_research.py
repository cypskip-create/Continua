"""Small, deterministic OLS with chronological holdout, not a prediction feed."""
import math

def total(values):
    result=0
    for value in values: result+=value
    return result

def mean(values): return total(values)/len(values)

def solve(a,b):
    m=[row[:]+[b[i]] for i,row in enumerate(a)];n=len(b)
    for k in range(n):
        pivot=max(range(k,n),key=lambda i:abs(m[i][k]));m[k],m[pivot]=m[pivot],m[k]
        if abs(m[k][k])<1e-12: raise ValueError('Factor matrix is singular or ill-conditioned. Remove duplicate/constant factors.')
        value=m[k][k]
        for j in range(k,n+1): m[k][j]/=value
        for i in range(n):
            if i!=k:
                f=m[i][k]
                for j in range(k,n+1): m[i][j]-=f*m[k][j]
    return [row[n] for row in m]

def factor_research(points):
    sort=lambda names:sorted(names,key=lambda v:v.encode('utf-16-be',errors='surrogatepass'))
    names=sort(points[0].get('factors',{})) if points else []
    if len(points)<180 or not 1<=len(names)<=3 or any(sort(p['factors'])!=names for p in points): raise ValueError('180 aligned observations with the same one to three factor names are required.')
    split=math.floor(len(points)*2/3);train,test=points[:split],points[split:];n=len(names)+1
    vector=lambda p:[1]+[p['factors'][name] for name in names]
    a,b=[[0]*n for _ in range(n)],[0]*n
    for p in train:
        x=vector(p)
        for i in range(n):
            b[i]+=x[i]*p['portfolioReturn']
            for j in range(n): a[i][j]+=x[i]*x[j]
    beta=solve(a,b);predict=lambda p:total(x*beta[i] for i,x in enumerate(vector(p)))
    def r2(rows):
        m=mean([p['portfolioReturn'] for p in rows]);sst=total((p['portfolioReturn']-m)**2 for p in rows);sse=total((p['portfolioReturn']-predict(p))**2 for p in rows)
        return 1-sse/sst if sst>1e-18 else None
    ordered=sorted(p['portfolioReturn'] for p in train);tail=math.ceil(len(train)*.05);threshold=ordered[tail-1];breaches=sum(p['portfolioReturn']<threshold for p in test)
    return {'intercept':beta[0],'exposures':[{'factor':name,'beta':beta[i+1]} for i,name in enumerate(names)],'trainingObservations':len(train),'holdoutObservations':len(test),
        'trainingR2':r2(train),'holdoutR2':r2(test),'holdoutRmsePercent':math.sqrt(mean([(p['portfolioReturn']-predict(p))**2 for p in test]))*100,
        'historicalVaR95Percent':max(0,-threshold)*100,'expectedShortfall95Percent':max(0,-mean(ordered[:tail]))*100,
        'holdoutBreachCount':breaches,'holdoutBreachRatePercent':breaches/len(test)*100,'curve':[{'date':p['date'],'index':p['portfolioReturn']*100,'benchmark':predict(p)*100} for p in points],
        'methodology':'OLS exposures trained only on the first two-thirds of observations; the final third is an untouched temporal holdout. VaR/ES are empirical training-sample portfolio-return tails, not factor-predicted losses. Breaches compare holdout returns with the fixed training 5% threshold. Negative holdout R² is possible. These diagnostics do not certify calibration, causality, suitability or future performance.'}
