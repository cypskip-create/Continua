"""Issuer evidence, article quality and topic rules. Never infer a price impact."""
import re
import unicodedata
from functools import lru_cache
from urllib.parse import urlsplit
from .research_components import utf16_slice
from .publication import resolve_company_entity

FLAGS = re.I | re.ASCII

CATEGORY_KEYWORDS = {
    'markets': [],
    'earnings': ['earnings','profit','net profit','half-year results','full-year results','quarterly results','dividend','eps','interim results','annual results','revenue rose','revenue fell','posts a profit','posts a loss','pre-tax profit'],
    'economy': ['central bank','cbk','inflation','gdp','interest rate','monetary policy','shilling','treasury','budget','imf','world bank','public debt','fiscal','exchange rate','forex','trade deficit','balance of payments','real estate','property market','housing','mortgage','rent','construction'],
    'companies': ['appoints','ceo','board','acquisition','merger','stake','ipo','listing','rights issue','shareholders','restructuring','partnership','expansion'],
}

def classify_news_category(text):
    lower=text.lower()
    best,best_score='markets',0
    for category,keywords in CATEGORY_KEYWORDS.items():
        score=sum(keyword in lower for keyword in keywords)
        if score>best_score:best,best_score=category,score
    return best

def news_ingestion_input(row,directory):
    headline,text=row.get('title'),row.get('text')
    if not isinstance(headline,str) or not headline.strip() or not isinstance(text,str) or not text.strip():
        raise ValueError('Missing article evidence')
    evidence=analyze_news_issuers(headline,text,directory)
    security_ids=[entry['securityId'] for entry in evidence]
    entity=row.get('entity') or {}
    image=entity.get('imageUrl')
    if image is not None and not isinstance(image,str):raise ValueError('Invalid observed image')
    return {'headline':headline,'excerpt':utf16_slice(text,400),'articleUrl':row['documentUrl'],
            'source':row['sourceId'],'sourceName':row.get('sourceName') or row['sourceId'],
            'category':classify_news_category(headline+'\n'+text),'securityIds':security_ids,'imageUrl':image,
            'scrapedArtifactId':row['artifactId'],'scrapedExtractionId':row['extractionId'],
            'extractionConfidence':row.get('confidence'),'needsReview':bool(row.get('needsReview')) or not security_ids,
            'publishedAt':row.get('publishedAt')}

def news_revalidation(headline,text,directory):
    return [entry['securityId'] for entry in analyze_news_issuers(headline,text,directory)]

def announcement_ingestion_input(row,companies):
    raw_name=(row.get('entity') or {}).get('companyName')
    if raw_name is None:raw_name=row.get('title')
    if raw_name is not None and not isinstance(raw_name,str):raise ValueError('Invalid observed issuer')
    resolved=resolve_company_entity(raw_name,companies) if raw_name else None
    text=row.get('text')
    if text is not None and not isinstance(text,str):raise ValueError('Invalid filing excerpt')
    return {'companyId':resolved['companyId'] if resolved else None,'securityId':resolved['securityId'] if resolved else None,
            'rawCompanyName':raw_name,'title':row.get('title') if row.get('title') is not None else '(untitled)',
            'documentUrl':row['documentUrl'],'source':row['sourceId'],'exchange':'NSE',
            'scrapedArtifactId':row['artifactId'],'scrapedExtractionId':row['extractionId'],
            'extractionConfidence':row.get('confidence'),'needsReview':bool(row.get('needsReview')),
            'excerpt':utf16_slice(text,500) if text else None,'publishedAt':None}
ALIASES = {
    'SCOM': ['Safaricom', 'M-Pesa', 'MPesa'], 'KQ': ['Kenya Airways'],
    'KPLC': ['Kenya Power', 'Kenya Power and Lighting'], 'KEGN': ['KenGen', 'Kenya Electricity Generating'],
    'EQTY': ['Equity Bank', 'Equity Group', 'Equity BCDC'], 'KCB': ['KCB Bank', 'KCB Group', 'Kenya Commercial Bank'],
    'COOP': ['Co-operative Bank', 'Cooperative Bank', 'Co-op Bank'], 'ABSA': ['Absa Bank', 'Absa Kenya', 'Absa'],
    'JUB': ['Jubilee Health', 'Jubilee Insurance', 'Jubilee Holdings'], 'TOTL': ['TotalEnergies', 'Total Energies', 'Total Kenya'],
    'BRIT': ['Britam'], 'BAMB': ['Bamburi Cement'], 'SCBK': ['Standard Chartered'],
    'IMH': ['I&M Bank', 'I&M Group'], 'NCBA': ['NCBA', 'NCBA Bank'], 'DTK': ['Diamond Trust Bank'], 'BKG': ['Bank of Kigali', 'BK Group'],
}
GENERIC = {'equity', 'total', 'express', 'standard', 'jubilee', 'liberty', 'national', 'home', 'car', 'crown', 'capital', 'mobile', 'image', 'gold', 'bond', 'kenya', 'bank', 'nse'}
MENU_TERMS = r'\b(home|factcheck|person of interest|election watch|sports|throw back|word of the day|brand voice|careers|leadership|lifestyle|inspiration|self-help)\b'
BOILERPLATE = r'^(?:related(?: stories| articles| posts)?|also read|read also|recommended|more (?:stories|news)|latest (?:news|stories)|you may also like|market watch|stock prices|share prices|trending|advertisement|subscribe|follow us)\b'
PRICE_RAIL = r'(?:\b(?:KES|KSH|KSHS)\s*[\d,.]+|[+-]\d+(?:\.\d+)?%)'
FINANCIAL = r'\b(stocks?|stock market|share price|shareholders?|shares? (?:rise|fall|gain|drop|rally|surge)|securities|nse|nairobi securities exchange|bonds?|treasur(?:y|ies)|banking|loans?|credit market|insurance|invest(?:ment|ors?|ing)|financ(?:e|ial)|econom(?:y|ic)|inflation|interest rates?|monetary|currenc(?:y|ies)|shilling|forex|exchange rates?|gdp|budget|tax(?:es|ation)?|debt|real estate|mortgage|rent(?:al)?|housing market|commodit(?:y|ies)|oil prices?|fuel|petrol|diesel|energy tariffs?|earnings|profits?|revenues?|dividends?|ipo|mergers?|acquisition|mobile money|pensions?|sacco|capital market|exports?|imports?|trade (?:deal|deficit|surplus|policy|war)|economic growth)\b'
OFF_TOPIC = r'\b(killed|injured|banditry|cattle rustling|murder|passenger dies|road accident|car crash|bus crash|pilgrims?|robbery|football|sports?|celebrity|entertainment|church service|obituary|birthday|wedding|livestock killed)\b'
BUSINESS_ACTIVITY = r'\b(launch(?:es|ed)?|expands?|expansion|services?|network|operations?|customers?|regulator|licen[sc]e|contract|business|strategy|capacity|production|distribution|supply|demand|construction|property|properties|employment|jobs|wages|manufactur(?:ing|er)|tourism|retail|telecom)\b'


def size(value): return len(value.encode('utf-16-le', errors='surrogatepass')) // 2
def normalize(value):
    return re.sub(r'\s+', ' ', re.sub('[^a-z0-9]+', ' ', unicodedata.normalize('NFKC', value).lower()).strip())
def normalize_headline(value):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9\s]', ' ', unicodedata.normalize('NFKD', value).lower())).strip()


def canonical_url(value):
    try:
        url = urlsplit(value)
        if not url.scheme or not url.hostname:
            raise ValueError('Invalid article URL')
        host = re.sub(r'^www\.', '', url.hostname)
        path = url.path or '/'
        return (host + re.sub('/$', '', path)).lower()
    except ValueError:
        return re.sub('/$', '', re.split('[?#]', value)[0]).lower()


def clean_article_content(headline, value):
    if not value: return None
    title = normalize_headline(headline)
    unique, seen = [], set()
    for line in re.split(r'\n+', value):
        line = re.sub(r'\s+', ' ', line).strip()
        normalized = normalize_headline(line)
        if size(line) < 20 or normalized == title or len(re.findall(MENU_TERMS, line, FLAGS)) >= 4:
            continue
        if normalized not in seen:
            unique.append(line); seen.add(normalized)
    return '\n\n'.join(unique) or None


def dedupe_news(items):
    values = []
    for item in items:
        headline, url = normalize_headline(item['headline']), canonical_url(item['articleUrl'])
        existing = next((i for i, candidate in enumerate(values) if normalize_headline(candidate['headline']) == headline or canonical_url(candidate['articleUrl']) == url), None)
        if existing is None:
            values.append(item)
            continue
        previous = values[existing]
        def length(row):
            content = row.get('content')
            return size(content) if content is not None else size(row.get('excerpt') or '')
        prefer = item if length(item) > length(previous) else previous
        # Never union obsolete ticker tags into the preferred verified receipt.
        values[existing] = dict(prefer)
    return values


def is_financial_news(headline, excerpt='', has_linked_security=False):
    title = re.sub(r'<[^>]*>', ' ', headline)
    lead = re.split(r'related (?:stories|articles)|also read|read also|recommended|subscribe|cookie', re.sub(r'<[^>]*>', ' ', excerpt), maxsplit=1, flags=FLAGS)[0]
    lead = utf16_slice(lead, 400)
    if re.search(OFF_TOPIC, title, FLAGS): return bool(re.search(FINANCIAL, title, FLAGS))
    if re.search(FINANCIAL, title, FLAGS): return True
    if re.search(OFF_TOPIC, lead, FLAGS): return False
    return bool(re.search(FINANCIAL, lead, FLAGS) or (has_linked_security and re.search(BUSINESS_ACTIVITY, title + ' ' + lead, FLAGS)))


def article_evidence_text(headline, raw):
    lines = [re.sub(r'\s+', ' ', line).strip() for line in re.split(r'\n+', re.sub(r'<[^>]*>', ' ', raw))]
    normalized_title=normalize(headline)
    title_index = next((i for i, line in enumerate(lines) if normalize(line) == normalized_title), None)
    if title_index is not None: lines = lines[title_index + 1:]
    selected = []
    for line in lines:
        if re.search(BOILERPLATE, line, FLAGS): break
        if normalize(line) == normalized_title or size(line) < 35: continue
        if len(re.findall(PRICE_RAIL, line, FLAGS)) >= 2: continue
        if re.search(r'\b(track your portfolio|cookie|privacy policy|all rights reserved|sign up|newsletter)\b', line, FLAGS): continue
        selected.append(line)
        if size(' '.join(selected)) >= 4000: break
    return utf16_slice('\n'.join(selected), 4000)


@lru_cache(maxsize=1024)
def issuer_patterns(symbol,company_name):
    name=re.sub(r'\s+', ' ', re.sub(r'\b(?:plc|ltd|limited|incorporated|holdings)\b', ' ', company_name, flags=FLAGS)).strip()
    core=normalize(name)
    phrases=list(dict.fromkeys(ALIASES.get(symbol, [])+([name] if len(core)>=5 and core not in GENERIC else [])))
    normalized_phrases=tuple((phrase,' '+normalize(phrase)+' ') for phrase in phrases)
    ticker=re.compile(r'(?:\$'+re.escape(symbol)+r'\b|\('+re.escape(symbol)+r'\)|\bNSE\s*:\s*'+re.escape(symbol)+r'\b)',re.ASCII)
    headline_ticker=re.compile(r'\b'+re.escape(symbol)+r'\b',re.ASCII) if len(symbol)>=3 and symbol.lower() not in GENERIC else None
    return normalized_phrases,ticker,headline_ticker

def analyze_news_issuers(headline, raw, directory):
    if len(directory) > 1000: raise ValueError('Issuer directory limit')
    body = article_evidence_text(headline, raw)
    sentences = [s for s in re.split(r'(?<=[.!?])\s+|\n+', body) if size(s) >= 35]
    normalized_sentences = {s: ' ' + normalize(s) + ' ' for s in sentences}
    normalized_headline = ' ' + normalize(headline) + ' '
    matches = []
    named_counts={}
    # The original generic-directory spelling and alias choice are preserved.
    named_phrases=[tuple(' '+normalize(p)+' ' for p in ALIASES.get(i['symbol'],[i['companyName']])) for i in directory]
    for issuer in directory:
        symbol = issuer['symbol'].upper()
        if re.search(r'^safaricom\b', issuer['companyName'], FLAGS) and symbol != 'SCOM': continue
        if symbol == 'NSE' and not re.search(r'\b(?:NSE|Nairobi Securities Exchange)(?:\s+PLC)?\s+(?:reports?|posts?|announces?|declares?)\b.*\b(?:profit|earnings|revenue|dividend|results)\b', headline + ' ' + body, FLAGS): continue
        normalized_phrases,ticker,headline_pattern=issuer_patterns(symbol,issuer['companyName'])
        def phrase_in(text):
            # dict.get's default is evaluated eagerly. Do not normalize every
            # sentence again for every issuer when it is already in the map.
            normalized = normalized_headline if text == headline else normalized_sentences[text] if text in normalized_sentences else ' '+normalize(text)+' '
            return next((original for original, phrase in normalized_phrases if phrase in normalized), None)
        headline_ticker = headline_pattern.search(headline) if headline_pattern and symbol in headline else None
        title_phrase = phrase_in(headline)
        def relationship(phrase): return 'brand' if phrase and re.search(r'm.?pesa|jubilee health|equity bcdc', phrase, FLAGS) else 'issuer'
        if title_phrase or (symbol in headline and ticker.search(headline)) or headline_ticker:
            matches.append({**issuer, 'evidence': utf16_slice(headline, 300), 'basis': 'headline', 'relationship': relationship(title_phrase)})
            continue
        # All ticker alternatives contain the exact case-sensitive symbol.
        # Cheap substring rejection avoids scanning every sentence with a
        # regular expression for each unrelated issuer, without changing rules.
        sentence = next((s for s in sentences if phrase_in(s) or (symbol in s and ticker.search(s))), None)
        if sentence is None: continue
        if sentence not in named_counts:
            normalized_sentence=normalized_sentences[sentence]
            named_counts[sentence]=sum(any(phrase in normalized_sentence for phrase in phrases) for phrases in named_phrases)
        if named_counts[sentence] > 3: continue
        matches.append({**issuer, 'evidence': utf16_slice(sentence, 300), 'basis': 'article', 'relationship': relationship(phrase_in(sentence))})
    return matches


def news_impact(headline, excerpt, symbols):
    if not symbols: return None
    text = headline + ' ' + (excerpt or '')
    topics = [
        (r'\b(passenger dies|safety incident|flight disruption|flight cancellation|fleet grounded)\b', 'Operational risk', 'Reported airline operations or safety event. Relevance to the named issuer is established; a financial or price effect is not established by the headline alone.'),
        (r'\b(cbk|regulat\w*|compliance|fraud|cyber\w*|court|lawsuit)\b', 'Regulation & risk', 'May affect compliance obligations, operating risk or costs.'),
        (r'\b(dividend|payout|ex-dividend)\b', 'Shareholder income', "May affect dividend income; verify the company's confirmed payment terms."),
        (r'\b(earnings|profit|revenue|results|loss)\b', 'Financial performance', 'May change the financial inputs used in profitability and valuation analysis.'),
        (r'\b(acquisition|merger|expansion|partnership|stake|rights issue)\b', 'Company development', "May affect the company's growth, ownership or capital requirements."),
    ]
    topic, reason = next(((topic, reason) for pattern, topic, reason in topics if re.search(pattern, text, FLAGS)), ('Company news', 'The article mentions this holding or a known company brand; assess the source before drawing conclusions.'))
    return {'topic': topic, 'reason': reason, 'symbols': symbols, 'methodology': 'Issuer/brand matching and rule-based topic classification. Relevance is not a directional price prediction.'}


def map_news_rows(rows, directory, security_id=None):
    if len(rows) > 128: raise ValueError('News mapping batch limit')
    items = []
    for row in rows:
        matching = row.get('matchingText')
        if matching is None: matching = row.get('content')
        if matching is None: matching = row.get('excerpt') or ''
        evidence = analyze_news_issuers(row['headline'], matching, directory)
        symbols, ids = [e['symbol'] for e in evidence], [e['securityId'] for e in evidence]
        if security_id is not None and security_id not in ids: continue
        if not is_financial_news(row['headline'], row.get('excerpt') or '', bool(ids)): continue
        confidence = row.get('extractionConfidence')
        item = {key: row.get(key) for key in ['id', 'headline', 'excerpt', 'articleUrl', 'source', 'sourceName', 'category', 'imageUrl', 'scrapedArtifactId', 'scrapedExtractionId', 'needsReview', 'publishedAt']}
        item.update({'content': clean_article_content(row['headline'], row.get('content')), 'securityIds': ids, 'symbols': symbols,
                     'relevance': {'version': 2, 'evidence': evidence, 'methodology': 'Direct issuer or known brand evidence in the headline or article prose. Unrelated market widgets and legacy tags are excluded. Relevance does not establish a price impact.'},
                     'extractionConfidence': float(confidence) if confidence is not None else None, 'impact': news_impact(row['headline'], row.get('excerpt'), symbols)})
        items.append(item)
    return items
