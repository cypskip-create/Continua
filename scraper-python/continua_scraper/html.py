"""Publisher HTML parsers. Observations remain reviewed evidence, not canon."""
import re
import json
import math
from datetime import date,datetime,timezone
from urllib.parse import urljoin,urlsplit,urlunsplit,quote

MAX_HTML_BYTES=8*1024*1024

def soup(html):
    from bs4 import BeautifulSoup
    if not isinstance(html,str) or len(html.encode('utf-8'))>MAX_HTML_BYTES:raise ValueError('HTML parser input exceeds limit')
    return BeautifulSoup(html,'html5lib')

def resolve_url(base,href):
    try:
        value=urljoin(base,href);p=urlsplit(value)
        if not p.hostname or p.scheme not in ('http','https') or p.username is not None or p.password is not None or any(ord(c)<32 for c in value):return None
        port=p.port
        netloc=p.hostname.lower()+(':'+str(port) if port is not None and port!=(443 if p.scheme=='https' else 80) else '')
        return urlunsplit((p.scheme,netloc,quote(p.path or '/',safe="/%:@!$&'()*+,;=-._~"),quote(p.query,safe="%=&?/:@!$'()*+,;-._~"),p.fragment))
    except (TypeError,ValueError):return None

def _text(node):return node.get_text() if node is not None else ''
def _normalized(value):return re.sub(r'\s+',' ',value).strip()
def normalize_feed_summary(value):
    return _normalized(soup(value).get_text()) or None if isinstance(value,str) else None

def article_body_text(html):
    doc=soup(html)
    for node in doc.select('script,style,nav,header,footer,aside,form,iframe,noscript,svg,canvas'):node.decompose()
    selectors=["[itemprop='articleBody']",'.entry-content','.post-content','.article-content','.story-body','.article-body','main article','article','main','body']
    root=next((node for selector in selectors if (node:=doc.select_one(selector)) is not None),doc)
    for node in root.select(".related,.recommended,.also-read,.read-more,.tags,.tag-list,.categories,.breadcrumbs,.share,.social,.newsletter,.advert,.advertisement,.ticker,.market-watch,[role='navigation'],[class*='related-'],[class*='recommended-'],[class*='ticker-'],[id*='related-'],[id*='ticker-'],.jp-relatedposts,.yarpp-related"):node.decompose()
    paragraphs=[]
    for node in root.select('p'):
        if node.find_parent('li') is not None or node.find_parent(attrs={'role':'complementary'}) is not None:continue
        line=_normalized(_text(node))
        if len(line)<20 or re.match(r'^(also read|read also|related|subscribe|follow us)\b',line,re.I):continue
        if len(re.findall(r'(?:\bKES\s*[\d,.]+|[+-]\d+(?:\.\d+)?%)',line,re.I))>=2:continue
        paragraphs.append(line)
    if paragraphs:
        heading=_normalized(_text(root.select_one('h1')))
        return '\n'.join(([heading] if heading else [])+paragraphs).strip()
    return '\n'.join(line.strip() for line in _text(root).split('\n') if line.strip()).strip()

def article_image(html,page_url):
    doc=soup(html)
    for selector in ['meta[property="og:image"]','meta[name="twitter:image"]']:
        node=doc.select_one(selector)
        if node is not None and node.get('content'):return resolve_url(page_url,node['content'])
    return None

def afx_profile_facts(html,*,document=None):
    doc=document if document is not None else soup(html);blocks=doc.select('[data-fact]');facts={}
    for block in blocks:
        for node in block.select('dt'):
            label=_text(node).strip().lower();following=node.find_next_sibling()
            value=_text(following).strip() if following is not None and following.name=='dd' else ''
            if label in ('sector','industry','address','website') and value:facts[label]=value
    company=re.sub(r'^Factsheet of\s+','', ''.join(_text(n) for block in blocks for n in block.select('h3')),flags=re.I).strip()
    return {'kind':'publisher_profile','companyName':company,'facts':facts} if company and facts else None

def afx_close_candidates(html,now=None,*,document=None):
    today=now or datetime.now(timezone.utc).date().isoformat();rows=[]
    doc=document if document is not None else soup(html)
    for table in doc.select('table'):
        trs=table.select('tr');heading=_text(trs[0]) if trs else ''
        if not all(re.search(label,heading,re.I) for label in ('date','volume','close')):continue
        for tr in trs[1:]:
            cells=[_text(td).strip() for td in tr.select('td')]
            if len(cells)<3:continue
            stamp=cells[0]
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',stamp) or date.fromisoformat(stamp).isoformat()!=stamp or stamp>today:continue
                close=float(cells[2].replace(',',''))
                if not math.isfinite(close) or close<=0:continue
            except ValueError:continue
            volume=cells[1].replace(',','')
            rows.append({'kind':'historical_close_candidate','date':stamp,'close':close,'volume':int(volume) if re.fullmatch(r'\d+',volume) else None,
                'basis':'Publisher daily close only; no open, high or low supplied. Not canonical until source/reconciliation review.'})
    return rows

def kenyan_stock_links(html):
    links={}
    for node in soup(html).select('a[href]'):
        value=resolve_url('https://kenyanstocks.com',node['href'])
        if value:
            p=urlsplit(value)
            if p.scheme=='https' and p.netloc=='kenyanstocks.com' and re.fullmatch(r'/stock/nse/[A-Z0-9-]+',p.path):links[value]=None
    return list(links)

def kenyan_file_links(html,page_url):
    documents={}
    for block in soup(html).select('.file-content'):
        node=block.select_one('link[itemprop="url"]')
        value=resolve_url('https://assets.kenyanstocks.com',node.get('href')) if node and node.get('href') else None
        # The source uses absolute asset links. Relative or alternate endpoint
        # links must not silently expand the evidence source permission.
        if not node or not str(node.get('href','')).startswith('https://') or not value:continue
        p=urlsplit(value)
        if p.hostname!='assets.kenyanstocks.com' or p.port not in (None,443) or not p.path.endswith('.pdf'):continue
        time=block.select_one('time')
        documents[value]={'url':value,'title':_text(block.select_one('h3')).strip(),'discoveredFrom':page_url,
            'context':{'mirror':True,'publisher':'KenyanStocks','listingUploadedAt':time.get('datetime') if time else None}}
    return list(documents.values())

def official_nse_url(raw):
    try:
        p=urlsplit(raw)
        return p.scheme=='https' and p.hostname in ('nse.co.ke','www.nse.co.ke') and p.port in (None,443) and p.username is None and p.password is None
    except (TypeError,ValueError):return False

def canonical_archive_url(raw):
    normalized=resolve_url(raw,raw)
    if not normalized:raise ValueError('Invalid archive URL')
    p=urlsplit(normalized);path=p.path
    if not path.endswith('/') and not re.search(r'\.[a-z0-9]+$',path,re.I):path+='/'
    return urlunsplit((p.scheme,p.netloc,path,p.query,''))

def archive_category_links(html,page_url):
    links={}
    for node in soup(html).select('a[href]'):
        value=resolve_url(page_url,node['href'])
        if not value or not official_nse_url(value):continue
        p=urlsplit(value)
        if p.fragment or not re.match(r'^/(listed-company-announcements|corporate-actions|press-releases|nse-events|success-stories|publications)(/|$)',p.path):continue
        canonical=canonical_archive_url(value)
        if canonical!=canonical_archive_url(page_url):links[canonical]=None
    return list(links)

def archive_form_config(html,from_year=2015,now_year=None):
    doc=soup(html);config=None;current=now_year or datetime.now(timezone.utc).year
    for script in doc.select('script:not([src])'):
        match=re.search(r'var\s+wp_ajax\s*=\s*(\{[^;]+\})\s*;',str(script.string or ''))
        if not match:continue
        try:
            parsed=json.loads(match[1])
            if isinstance(parsed,dict) and parsed.get('nse_id'):config=parsed
        except ValueError:continue
    if not config or not isinstance(config.get('ajaxurl'),str) or not official_nse_url(config['ajaxurl']) or not isinstance(config.get('ajaxnonce'),str):return None
    years=set()
    for button in doc.select('button.yearclick[data-year][data-cid]'):
        year=button['data-year']
        if re.fullmatch(r'20\d{2}',year) and from_year<=int(year)<=current and button['data-cid']==str(config['nse_id']):years.add(year)
    return {'endpoint':config['ajaxurl'],'security':config['ajaxnonce'],'category':str(config['nse_id']),'limit':str(config.get('limit') or ''),'expiry':str(config.get('expiry') or ''),'years':sorted(years)}

def archive_page_numbers(html):
    return sorted({int(n['id']) for n in soup(html).select('.nse_paginations div[id]') if re.fullmatch(r'\d+',n['id']) and 1<=int(n['id'])<=500})

def archive_documents(html,page_url,context=None):
    doc=soup(html);root=doc.select_one('#ajax-content-wrap') or doc;heading=None;documents={}
    for node in root.select('h1,h2,h3,h4,a[href]'):
        if re.fullmatch('h[1-4]',node.name):heading=_text(node).strip() or heading;continue
        href=node.get('href')
        if not href or not re.search(r'\.pdf(?:[?#]|$)',href,re.I):continue
        value=resolve_url(page_url,href)
        if value and official_nse_url(value):documents[value]={'url':value,'title':heading,'discoveredFrom':page_url,
            'context':dict(context or {},titleHeuristic='nearest_preceding_heading',documentRole='publisher_document')}
    return list(documents.values())

def discover_archive_links(html,page_url):
    links={}
    for node in soup(html).select('a[href]'):
        label=_text(node).strip()
        if not (re.fullmatch(r'(19|20)\d{2}',label) or re.fullmatch(r'(next|older|previous|\d+)\s*(page|[›»→])?',label,re.I)):continue
        value=resolve_url(page_url,node['href'])
        if value and urlsplit(value).netloc==urlsplit(page_url).netloc and not urlsplit(value).fragment:
            canonical=canonical_archive_url(value)
            if canonical!=canonical_archive_url(page_url):links[canonical]=None
    for value in archive_category_links(html,page_url):links[value]=None
    return list(links)

def canonicalize_url(raw):
    normalized=resolve_url(raw,raw)
    if not normalized:raise ValueError('Invalid crawl URL')
    p=urlsplit(normalized);path=p.path[:-1] if len(p.path)>1 and p.path.endswith('/') else p.path
    return urlunsplit((p.scheme,p.netloc,path,p.query,''))

def matches_discovery_paths(url,patterns=None):
    if not patterns:return True
    try:return any(fragment.lower() in urlsplit(url).path.lower() for fragment in patterns)
    except (ValueError,TypeError):return False

def extract_from_html(html,page_url):
    doc=soup(html);links=[]
    for selector,attribute,kind in [('a[href]','href','a'),('iframe[src]','src','iframe'),('embed[src]','src','embed'),('object[data]','data','object'),('link[rel="canonical"][href]','href','canonical'),('link[rel="alternate"][href]','href','alternate')]:
        for node in doc.select(selector):
            value=resolve_url(page_url,node.get(attribute))
            if value:links.append({'url':value,'kind':kind})
    graph={}
    for node in doc.select('meta[property^="og:"]'):
        if node.get('property') and node.get('content'):graph[node['property']]=node['content']
    ld=[]
    for node in doc.select('script[type="application/ld+json"]'):
        try:ld.append(json.loads(str(node.string or '')))
        except ValueError:pass
    def meta(selector,fallback=None):
        node=doc.select_one(selector)
        return node.get('content',fallback) if node else fallback
    canonical=doc.select_one('link[rel="canonical"]')
    metadata={'title':_text(doc.select_one('title')).strip() or graph.get('og:title'),'description':meta('meta[name="description"]',graph.get('og:description')),
        'canonicalUrl':resolve_url(page_url,canonical['href']) if canonical and canonical.get('href') else None,'openGraph':graph,'jsonLd':ld,
        'publishedAt':meta('meta[property="article:published_time"]',meta('meta[name="date"]')),'modifiedAt':meta('meta[property="article:modified_time"]'),'author':meta('meta[name="author"]')}
    return {'links':links,'metadata':metadata}

def nse_index_summary(html):
    doc=soup(html);match=re.search(r'Statistics\s+As\s+of\s+(\d{2})-([A-Z]{3})-(\d{2}|\d{4})\b',_text(doc.select_one('.stat_date')),re.I)
    if not match:return []
    months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    try:
        year=(2000+int(match[3])) if len(match[3])==2 else int(match[3]);month=months.index(match[2].upper())+1
        # Match ECMAScript Date.UTC's explicit 0..99 year offset.
        if 0<=year<=99:year+=1900
        stamp=datetime(year,month,int(match[1]),tzinfo=timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    except (ValueError,OverflowError):return []
    codes={'NSE ALL SHARE INDEX':'NASI','N.A.S.I':'NASI','NASI':'NASI','NSE 20 SHARE INDEX':'NSE20','NSE 20':'NSE20','NSE 25 SHARE INDEX':'NSE25','NSE 25':'NSE25','NSE 10 SHARE INDEX':'NSE10','NSE 10':'NSE10'}
    rows={}
    for col in doc.select('.nse_statistics .stat_col'):
        code=codes.get(''.join(_text(n) for n in col.select('.stat_head')).strip().upper())
        if not code:continue
        figure=col.select_one('.stat_figures p')
        if not figure:continue
        change=''.join(_text(n) for n in figure.select('.stat_percent')).strip().replace(',','').replace('−','-',1)
        for n in figure.select('span'):n.decompose()
        level=_text(figure).strip().replace(',','')
        if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',change) or not re.fullmatch(r'\d+(?:\.\d+)?',level):continue
        value,delta=float(level),float(change)
        if not math.isfinite(value) or not math.isfinite(delta) or value<=0 or value-delta<=0:continue
        rows[code]={'kind':'nse_index','code':code,'value':value,'change':delta,'asOf':stamp}
    return list(rows.values())
