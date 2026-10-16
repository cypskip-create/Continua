"""Deterministic, source-labelled research for every collected publisher view.

This is observation publication, not an accounting-approval shortcut. Unknown
PDF layouts are indexed and tabled, but never promoted to audited statements.
No network, storage credentials, execution of publisher scripts or paid models.
"""
import math
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

VERSION = 'collected-research-v1'
DESTINATIONS = {'Summary': 'overview', 'Financials': 'financials', 'Statistics': 'statistics',
                'News': 'news', 'Corporate Actions': 'corporateActions', 'Historical Data': 'history',
                'Holders': 'ownership', 'Files': 'documents', 'Document': 'documents'}
ALIASES = {'DTK': 'DTB', 'SBIC': 'STANBIC', 'HFCK': 'HFCB'}
MAX_ROWS = 20000


def number(raw):
    if not isinstance(raw, str) or len(raw) > 100:
        return None
    value = re.sub(r'[▲▼↑↓,]', '', raw).strip()
    # Financial reports commonly put the suffix inside the negative brackets.
    if value.startswith('(') and value.endswith(')') and re.fullmatch(r'\(\d+(?:\.\d+)?\s*[KMBT%]\)',value,re.I):
        value='-'+value[1:-1]
    match = re.fullmatch(r'(KES\s*)?(\(?-?\d+(?:\.\d+)?\)?)\s*([KMBT%])?', value, re.I)
    if not match or match[2].count('(') != match[2].count(')'):
        return None
    negative = match[2].startswith('(')
    if negative and '-' in match[2]:
        return None
    try:
        suffix = (match[3] or '').upper()
        n = Decimal(match[2].strip('()')) * (-1 if negative else 1)
        n *= {'K': 1000, 'M': 10**6, 'B': 10**9, 'T': 10**12}.get(suffix, 1)
        if not n.is_finite() or abs(n) > Decimal('1e18'):
            return None
        return {'value': float(n), 'decimal': str(n), 'unit': 'percent' if suffix == '%' else 'KES' if match[1] else 'reported',
                'approximate': suffix in ('K', 'M', 'B', 'T'), 'raw': raw}
    except InvalidOperation:
        return None


def public_url(value):
    if not isinstance(value, str) or len(value) > 4096:
        return None
    try:
        u = urlsplit(value)
        return value if u.scheme == 'https' and u.hostname and not u.username and not u.password and u.port in (None, 443) else None
    except ValueError:
        return None


def clean(value, limit=500):
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)[:limit] if isinstance(value, str) else ''


def table_view(table, current_year):
    """Preserve all labels/raw cells. Chart only unambiguous year/value pairs."""
    columns = table.get('columns')
    if not isinstance(columns, list):
        header = table.get('headerLine') or ''
        columns = [c.strip() for c in header.split('|')] if '|' in header else []
    columns = [clean(c, 100) for c in columns[:25]]
    rows, charts = [], []
    years = columns[1:]
    dated = bool(years) and all(re.fullmatch(r'20\d{2}', y) and 2015 <= int(y) <= current_year for y in years) and len(set(years)) == len(years)
    source_rows = table.get('rows') or []
    if not isinstance(source_rows, list) or len(source_rows) > MAX_ROWS:
        raise ValueError('Table row budget exceeded')
    for row in source_rows:
        if not isinstance(row, dict):
            continue
        label = clean(row.get('label'))
        cells = row.get('cells', row.get('values', []))
        if not label or not isinstance(cells, list):
            continue
        raw = [clean(c.get('raw'), 100) if isinstance(c, dict) else clean(c, 100) for c in cells[:24]]
        parsed = [number(c) for c in raw]
        kind = row.get('rowKind') if row.get('rowKind') in ('group', 'total', 'item') else 'item'
        rows.append({'label': label, 'rowKind': kind, 'values': raw, 'numbers': parsed})
        if dated and kind != 'group' and len(raw) == len(years) and any(p is not None for p in parsed):
            units = {p['unit'] for p in parsed if p is not None}
            if len(units) != 1:
                continue
            points = sorted([{'year': int(y), **(p or {'value': None, 'raw': r, 'approximate': False})} for y, p, r in zip(years, parsed, raw)], key=lambda p: p['year'])
            growth = None
            if len(points) >= 2:
                a, b = points[-2:]
                if b['year'] == a['year'] + 1 and a['value'] is not None and a['value'] > 0 and b['value'] is not None:
                    growth = (b['value'] - a['value']) / a['value'] * 100
            charts.append({'label': label, 'unit': next(iter(units)), 'points': points, 'growthPercent': growth,
                           'status': 'publisher_observation'})
    return {'category': clean(table.get('category'), 100) or clean(table.get('title'), 200) or None,
            'columns': columns, 'rows': rows}, charts


def history_view(table, today):
    by_date, conflicts, rejected = {}, set(), 0
    for row in table.get('observations', []):
        if not isinstance(row, dict):
            rejected += 1
            continue
        stamp = row.get('date')
        try:
            valid_date = isinstance(stamp, str) and date.fromisoformat(stamp).isoformat() == stamp and '2015-01-01' <= stamp <= today
        except ValueError:
            valid_date = False
        vals = [row.get(k) for k in ('open', 'high', 'low', 'close', 'volume')]
        valid_numbers = all(type(v) in (int, float) and math.isfinite(v) and abs(v) <= 1e18 for v in vals)
        if not valid_date or not valid_numbers:
            rejected += 1
            continue
        o, h, l, c, v = vals
        if min(o, h, l, c) <= 0 or h < max(o, l, c) or l > min(o, h, c) or v < 0 or int(v) != v:
            rejected += 1
            continue
        item = dict(zip(('open', 'high', 'low', 'close', 'volume'), vals), date=stamp,
                    volumeApproximate=row.get('volumeApproximate') is True, adjustment='unknown')
        if stamp in by_date and by_date[stamp] != item:
            conflicts.add(stamp)
        by_date[stamp] = item
    return [by_date[d] for d in sorted(by_date) if d not in conflicts], rejected + len(conflicts)


def document_view(row):
    text = row.get('text') or ''
    pages = text.rstrip('\f\n\r ').split('\f')
    sections = []
    for i, page in enumerate(pages[:500]):
        headings = []
        for line in page.splitlines():
            line = line.strip()
            if 5 <= len(line) <= 180 and (line.isupper() or re.search(r'\b(statement of|cash flows?|financial position|profit or loss|dividend|sharehold|director|auditor)\b', line, re.I)):
                if line not in headings:
                    headings.append(line)
        if headings:
            sections.append({'page': i + 1, 'headings': headings[:40]})
    text_lower = text.lower()
    kinds = [kind for kind, pattern in (
        ('financialStatements', r'statement of|financial results|financial statements'),
        ('annualReport', r'annual report|integrated report'), ('corporateActions', r'dividend|rights issue|share split|bonus issue'),
        ('ownership', r'shareholders|shareholding'), ('governance', r'board of directors|corporate governance|auditor')) if re.search(pattern, text_lower)]
    return {'title': clean(row.get('title'), 300), 'url': public_url(row.get('sourceUrl')), 'kinds': kinds or ['document'],
            'pageCount': len(pages), 'sections': sections, 'method': row.get('method'),
            'status': 'review_required', 'reason': 'Canonical financial publication requires issuer, period, units and accounting validation',
            'truncated': len(pages) > 500 or row.get('needsReview') is True}


def process_evidence(row, today=None):
    try:
        return _process_evidence(row,today)
    except (TypeError,AttributeError,KeyError,OverflowError) as error:
        raise ValueError('Invalid structured evidence shape') from error


def _process_evidence(row, today=None):
    today = today or date.today().isoformat()
    current_year = date.fromisoformat(today).year
    symbol = (row.get('entity') or {}).get('ticker')
    symbol = ALIASES.get(symbol, symbol)
    if not isinstance(symbol, str) or not re.fullmatch(r'[A-Z0-9.-]{1,20}', symbol):
        raise ValueError('Exact issuer context required')
    if not public_url(row.get('sourceUrl')):
        raise ValueError('HTTPS source evidence required')
    if len(row.get('text') or '')>16*1024*1024:
        raise ValueError('Document processing text budget exceeded')
    tables = row.get('tables') or []
    if not isinstance(tables, list) or len(tables) > 500:
        raise ValueError('Extraction table budget exceeded')
    metadata = row.get('metadata') or {}
    is_pdf = 'pdf' in (row.get('contentType') or '')
    if not is_pdf:
        u=urlsplit(row['sourceUrl'])
        ticker=(row.get('entity') or {}).get('ticker')
        if u.hostname!='kenyanstocks.com' or u.path!='/stock/nse/'+ticker:
            raise ValueError('Publisher URL does not match exact issuer context')
    tab = 'Document' if is_pdf else metadata.get('tab') or 'Summary'
    destination = DESTINATIONS.get(tab, 'additionalResearch')
    result = {'version': VERSION, 'symbol': symbol, 'tab': tab, 'category': metadata.get('category'), 'destination': destination,
              'sourceUrl': row['sourceUrl'], 'observedAt': row.get('observedAt'), 'status': 'publisher_observation',
              'tables': [], 'charts': [], 'history': [], 'news': [], 'files': [], 'facts': [], 'documents': [], 'issues': []}
    count = 0
    for table in tables:
        if not isinstance(table, dict):
            continue
        kind = table.get('kind')
        count += len(table.get('rows') or []) + len(table.get('observations') or [])
        if count > MAX_ROWS:
            raise ValueError('Extraction row budget exceeded')
        if kind == 'publisher_ohlcv':
            history, rejected = history_view(table, today)
            result['history'].extend(history)
            if rejected:
                result['issues'].append({'code': 'invalid_or_conflicting_history', 'count': rejected})
        elif kind == 'publisher_news':
            for entry in (table.get('entries') or [])[:1000]:
                url = public_url(entry.get('url'))
                if url and clean(entry.get('title')):
                    result['news'].append({'url': url, 'title': clean(entry.get('title')), 'summary': clean(entry.get('summary'), 1000),
                                           'publisher': clean(entry.get('publisher'), 200), 'publishedAt': clean(entry.get('publishedAt'), 100) or None,
                                           'publishedAtRaw': clean(entry.get('publishedAtRaw'), 100)})
        elif kind == 'publisher_view':
            chart_points=0
            for chart in (table.get('charts') or [])[:30]:
                labels=chart.get('labels') or []
                if not isinstance(labels,list) or len(labels)>10000:continue
                for dataset in (chart.get('datasets') or [])[:30]:
                    data=dataset.get('data') or []
                    if not isinstance(data,list) or len(data)!=len(labels):continue
                    if any(v is not None and (type(v) not in (int,float) or not math.isfinite(v) or abs(v)>1e18) for v in data):continue
                    chart_points+=len(data)
                    if chart_points>20000:raise ValueError('Chart point budget exceeded')
                    result['charts'].append({'label':clean(dataset.get('label'),200),'unit':'publisher_chart_units',
                        'points':[{'label':clean(label,100),'value':v} for label,v in zip(labels,data)],
                        'status':'publisher_observation','axisScale':'as_reported'})
            for file in (table.get('files') or [])[:1000]:
                url = public_url(file.get('url'))
                if url and urlsplit(url).hostname in ('kenyanstocks.com', 'assets.kenyanstocks.com') and urlsplit(url).path.lower().endswith('.pdf'):
                    result['files'].append({'url': url, 'title': clean(file.get('title'), 300)})
            result['facts'].extend([{'label': clean(f.get('label')), 'raw': clean(f.get('raw'), 1000), 'number': number(f.get('raw'))}
                                    for f in (table.get('facts') or [])[:1000] if clean(f.get('label'))])
            result['headings'] = [clean(h, 200) for h in (table.get('headings') or [])[:200]]
            result['blocks'] = [clean(b, 2000) for b in (table.get('blocks') or [])[:300]]
        elif kind == 'publisher_table' or 'rows' in table:
            # Generic heuristic tables supplement, not duplicate the tab's
            # literal DOM table. PDF tables remain explicitly review-required.
            if not is_pdf and kind != 'publisher_table' and any(t.get('kind') == 'publisher_table' for t in tables if isinstance(t, dict)):
                continue
            view, charts = table_view(table, current_year)
            if view['rows']:
                view['status'] = 'review_required' if is_pdf else 'publisher_observation'
                result['tables'].append(view)
                if not is_pdf:
                    result['charts'].extend(charts)
    if is_pdf:
        result['documents'] = [document_view(row)]
        result['status'] = 'review_required'
    elif not any(result[k] for k in ('tables', 'charts', 'history', 'news', 'files', 'facts')) and not result.get('blocks'):
        result['status'] = 'empty'
        result['issues'].append({'code': 'no_structured_content'})
    return result
