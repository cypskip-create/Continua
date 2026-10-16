"""Literal publisher table/number/date evidence, never inferred statements."""
import re
import math
from datetime import date,datetime,timezone
from .html import soup,_text,_normalized

def publisher_number(raw):
    stripped=re.sub(r'[▲▼↑↓,]','',raw).strip()
    negative=stripped.startswith('(') and stripped.endswith(')')
    clean=stripped[1:-1].strip() if negative else stripped
    match=re.fullmatch(r'(?:KES\s*)?(\(?-?\d+(?:\.\d+)?\)?)\s*([KMBT%])?',clean,re.I)
    if not match:return {'value':None,'unit':None,'approximate':False}
    value=float(re.sub(r'[()]','',match[1]))*(-1 if negative or match[1].startswith('(') else 1)
    suffix=match[2].upper() if match[2] else None
    value*= {'K':1e3,'M':1e6,'B':1e9,'T':1e12}.get(suffix,1)
    return {'value':value if math.isfinite(value) else None,'unit':'percent' if suffix=='%' else 'KES' if re.search('KES',raw,re.I) else suffix,'approximate':bool(suffix and suffix!='%')}

def publisher_date(raw):
    text=raw.strip();short=re.fullmatch(r'(\d{2})/(\d{2})/(\d{2}|\d{4})',text)
    if short:
        stamp=f"{'20' if len(short[3])==2 else ''}{short[3]}-{short[2]}-{short[1]}"
    else:
        long=re.fullmatch(r'(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})',text)
        if not long:return None
        months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        month=next((i+1 for i,m in enumerate(months) if long[2].lower().startswith(m)),None)
        if month is None:return None
        stamp=f'{long[3]}-{month:02d}-{int(long[1]):02d}'
    try:return stamp if date.fromisoformat(stamp).isoformat()==stamp else None
    except ValueError:return None

def stock_tables(html,tab,category,now=None):
    doc=soup(html)
    for node in doc.select('.date-cell-sm'):node.decompose()
    tables=[];today=now or datetime.now(timezone.utc).date().isoformat()
    for index,table in enumerate(doc.select('table')):
        if category and table.get('data-continua-observed-visible')=='false':continue
        elements=table.select('tr')
        rows=[[_normalized(_text(n)) for n in tr.find_all(['th','td'],recursive=False)] for tr in elements]
        if not rows:continue
        columns=rows.pop(0)
        if '|'.join(v.lower() for v in columns)=='date|open|low|high|close|volume':
            observations=[]
            for cells in rows:
                stamp=publisher_date(cells[0] if cells else '')
                numbers=[publisher_number(raw) for raw in cells[1:]]
                values=[n['value'] for n in numbers]
                o=dict(zip(['open','low','high','close','volume'],values))
                prices=[o.get(k) for k in ('open','low','high','close')];volume=o.get('volume')
                valid=bool(stamp and stamp>='2015-01-01' and stamp<=today and all(v is not None and v>0 for v in prices) and volume is not None and volume>=0 and volume==int(volume) and o['high']>=max(prices) and o['low']<=min(o['open'],o['close']))
                o=dict(date=stamp,**o,volumeApproximate=numbers[4]['approximate'] if len(numbers)>4 else False,valid=valid,raw=cells)
                if len(cells)>5:o['volumeRaw']=cells[5]
                observations.append(o)
            tables.append({'kind':'publisher_ohlcv','tab':tab,'columns':columns,'observations':observations,'adjustment':'unknown','confidence':.7})
        else:
            group=None;output=[]
            for i,cells in enumerate(rows):
                grouped='group-header-row' in (elements[i+1].get('class') or [])
                label=cells[0] if cells else None
                if grouped:group=label
                row={'rowKind':'group' if grouped else 'total' if re.match(r'^total\b',label or '',re.I) else 'item','group':group,
                    'cells':[dict(raw=raw,**publisher_number(raw)) for raw in cells[1:]]}
                if label is not None:row['label']=label
                output.append(row)
            tables.append({'kind':'publisher_table','tab':tab,'category':category,'index':index,'columns':columns,'rows':output,'confidence':.6})
    return tables

def html_financial_tables(html):
    tables=[]
    for table in soup(html).select('table'):
        rows=[];headers=[]
        for tr in table.select('tr'):
            cells=[]
            for n in tr.find_all(['th','td'],recursive=False):
                for br in n.select('br'):br.replace_with(' ')
                cells.append(_normalized(_text(n)))
            if len(cells)<2:continue
            if len(tr.find_all('th',recursive=False))>1 or all(re.fullmatch(r"(?:FY\s*)?20\d{2}(?:\s*Shs['’]000)?",c) for c in cells[1:]):headers.append(' | '.join(cells));continue
            if cells[0] and re.search(r'[a-z]',cells[0],re.I) and any(re.fullmatch(r'\(?-?\d[\d, .]*\)?%?',c) for c in cells[1:]):rows.append({'label':cells[0],'values':cells[1:]})
        if len(rows)>=2:tables.append({'title':''.join(_text(c) for c in table.select('caption')).strip() or None,'headerLine':'\n'.join(headers) or None,'rows':rows,'method':'html_table_v1','confidence':.7})
    return tables

def publisher_view(html,page_url):
    """Keep visible non-table research and document manifests as observations."""
    from .html import kenyan_file_links
    doc=soup(html)
    for node in doc.select('script,style,nav,header,footer,noscript'):node.decompose()
    root=doc.select_one('main') or doc.body or doc
    headings=list(dict.fromkeys(_normalized(_text(n)) for n in root.select('h1,h2,h3,h4')))
    facts=[]
    for term in root.select('dt'):
        value=term.find_next_sibling('dd')
        if value:facts.append({'label':_normalized(_text(term)),'raw':_normalized(_text(value))})
    for label in root.select('.stat-label,.metric-label,.summary-label,.info-label,.stat-card > label,.metric-card > label'):
        value=label.find_next_sibling()
        if value:facts.append({'label':_normalized(_text(label)),'raw':_normalized(_text(value))})
    # Cards/list content not representable as a numeric table still has an
    # explicit processing path. Retain displayed text, not hidden scripts.
    blocks=[]
    for node in root.select('article,.action-card,.corporate-action,.stat-card,.metric-card,.summary-card'):
        value=_normalized(_text(node))
        if value and value not in blocks:blocks.append(value[:2000])
    import json
    charts=[]
    for node in root.select('canvas[data-continua-observed-chart]')[:30]:
        value=node.get('data-continua-observed-chart','')
        if len(value)>1000000:continue
        try:
            parsed=json.loads(value)
            if isinstance(parsed,dict):charts.append(parsed)
        except (ValueError,TypeError):continue
    return {'kind':'publisher_view','headings':headings[:200],'facts':facts[:1000],
            'blocks':blocks[:300],'files':kenyan_file_links(html,page_url),'charts':charts}

NUMERIC=re.compile(r'^\(?-?\d[\d,]*(\.\d+)?\)?%?$')
def _text_row(line):
    if re.search(r'(\.\s*){3,}',line):return None
    tokens=line.strip().split()
    if len(tokens)<2:return None
    split=len(tokens)
    for i in range(len(tokens)-1,-1,-1):
        if NUMERIC.fullmatch(tokens[i]):split=i
        else:break
    values,label=tokens[split:],tokens[:split]
    if not values or not label or any(NUMERIC.fullmatch(t) for t in label):return None
    return {'label':' '.join(label),'values':values}

def text_tables(text):
    lines=[line.strip() for line in text.split('\n')];tables=[];current=[];start=-1
    def flush():
        nonlocal current,start
        if len(current)>=2:
            preceding=lines[start-1] if start>0 else ''
            header=preceding if preceding and _text_row(preceding) is None else None
            title=None
            for i in range(start-1,max(-1,start-5),-1):
                candidate=lines[i]
                if not candidate:continue
                if _text_row(candidate):break
                if re.search('[A-Z]{4,}',candidate) and len(candidate)<120:title=candidate;break
            consistent=len({len(r['values']) for r in current})==1
            tables.append({'title':title,'headerLine':header,'rows':current,'method':'line_heuristic_v1','confidence':min(.85,(.5 if consistent else .3)+len(current)*.03)})
        current=[];start=-1
    for i,line in enumerate(lines):
        row=_text_row(line)
        if row:
            if not current:start=i
            current.append(row)
        else:flush()
    flush();return tables
