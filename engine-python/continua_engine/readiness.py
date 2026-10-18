"""Source coverage and reproducible evidence identity, not investment quality."""
import hashlib
import re
from datetime import datetime, timezone
from .dates import parse
from .numbers import finite, compatible_currency
from .evidence_json import stringify

METHOD_VERSION = 'nse-research-2026-10-v2'


def research_readiness(input, now=None):
    instant = parse(now) if now is not None else datetime.now(timezone.utc)
    if instant is None:
        raise ValueError('Invalid research observation time')
    today = instant.date().isoformat()
    rows = sorted(input['history'], key=lambda row: row['fiscalYear'])
    if len(rows) > 100 or any(not finite(r['fiscalYear']) or not 1900 <= r['fiscalYear'] <= 2100 for r in rows):
        raise ValueError('Invalid financial coverage range')
    issues, matrix = [], []
    def add(id, severity, message, tool='Evidence'):
        issues.append({'id': id, 'severity': severity, 'message': message, 'nextTool': tool})
    def dated(value):
        return isinstance(value, str) and re.match(r'^\d{4}-\d{2}-\d{2}', value) and parse(value) is not None
    def source(value):
        return isinstance(value, str) and value.lower().startswith('https://')
    for row in rows:
        end, filed = row.get('periodEnd'), row.get('reportedAt')
        urls = row.get('sourceUrls') or []
        matrix.append({'year': row['fiscalYear'], 'periodEnd': end, 'availableAt': filed,
                       'sourceCount': sum(source(u) for u in urls),
                       'observationAvailable': bool(any(finite(row.get(k)) for k in ('revenue','netIncome','eps','totalAssets','operatingCashFlow')) and any(source(u) for u in urls) and (not end or dated(end) and end[:10]<=today) and (not filed or dated(filed) and filed[:10]<=today)),
                       'basis': row.get('basis') or 'reviewed_filing',
                       'fields': {name: finite(row.get(field)) for name, field in [('revenue', 'revenue'), ('earnings', 'netIncome'), ('eps', 'eps'), ('assets', 'totalAssets'), ('cashFlow', 'operatingCashFlow')]},
                       'usable': bool(dated(end) and dated(filed) and end[:10] <= today and filed[:10] <= today and any(source(u) for u in urls))})
    years = list(dict.fromkeys(r['year'] for r in matrix))
    gaps = [year for year in range(int(years[0]), int(years[-1])) if year not in years] if years else []
    if not rows:
        add('financials-missing', 'blocked', 'No validated annual statements are available. Downloaded files alone do not establish financial coverage.', 'Earnings & Reports')
    if any(not row['observationAvailable'] for row in matrix):
        add('provenance', 'blocked', 'Some stored periods lack usable source-backed amounts or contain future dates.')
    if any(row['observationAvailable'] and not row['usable'] for row in matrix):
        add('filing-date-unavailable', 'warning', 'Financial observations are available. Unknown period ends or publication dates exclude them from point-in-time valuation and historical backtests; the amounts remain visible.')
    if len({(row['fiscalYear'], row.get('fiscalQuarter') or 'FY') for row in rows}) != len(rows):
        add('duplicate-period', 'blocked', 'Duplicate periods need reconciliation before comparing growth.')
    if gaps:
        add('year-gaps', 'warning', 'Missing annual periods: ' + ', '.join(map(str, gaps)) + '. Growth cannot bridge these gaps as a one-year change.', 'Earnings & Reports')
    if matrix and instant.year - matrix[-1]['year'] > 2:
        add('old-financials', 'warning', f"The latest annual financial period is FY{matrix[-1]['year']}; this is old evidence, not current-year earnings.", 'Earnings & Reports')
    quote = input.get('quote')
    if quote and any(not compatible_currency(row.get('currency'),quote.get('currency')) for row in rows):
        add('currency-basis','blocked','Some financial periods use a different currency from the quote. Price-based comparisons require a verified common currency, not an assumed conversion.','Valuation')
    quote_stamp = parse(quote.get('timestamp')) if quote else None
    quote_valid = bool(quote and finite(quote.get('lastPrice')) and quote['lastPrice'] > 0 and dated(quote.get('timestamp')) and quote_stamp <= instant and quote.get('source') != 'mock')
    if not quote_valid:
        add('quote-unusable', 'blocked', 'A positive, dated, non-mock quote is required for current-price analysis.', 'Valuation')
    elif (instant - quote_stamp).total_seconds() > 7 * 86400:
        add('quote-stale', 'warning', 'The last quote is over seven days old. A recent refresh does not make that price live.', 'Valuation')
    if input['unavailable']:
        add('partial-response', 'warning', ', '.join(dict.fromkeys(input['unavailable'])) + ' could not load. Missing responses are not zero values.')
    def eligibility(id, label, count, needed, reason):
        return {'id': id, 'label': label, 'status': 'available' if count >= needed else 'limited' if count > 0 else 'unavailable', 'observed': count, 'needed': needed, 'reason': reason}
    usable_years = [row['year'] for row in matrix if row['usable']]
    adjacent = sum(year - 1 in usable_years for year in usable_years)
    capabilities = [
        eligibility('statements', 'Financial observations', sum(r['observationAvailable'] for r in matrix), 1, 'Source-backed amounts remain visible when publication dates are unknown.'),
        eligibility('dated-statements', 'Point-in-time financial evidence', len(usable_years), 1, 'Requires source URLs, fiscal period end and publication date; excludes undated publisher observations.'),
        eligibility('growth', 'Annual growth', adjacent, 1, 'Requires consecutive fiscal years; sparse endpoints are not annual growth.'),
        eligibility('technicals', 'Price-indicator inputs', input['technicalObservations'], 35, 'A minimum-history screening check, not proof every indicator is computable. Uses dated provider bars; corporate-action adjustment requires separate verification.'),
        eligibility('estimates', 'Analyst estimates', input['estimateCount'], 1, 'Sourced estimates only; user scenarios do not count as analyst coverage.'),
        eligibility('ownership', 'Disclosed ownership', input['ownershipCount'], 1, 'Disclosures are dated snapshots, not evidence of trading.'),
    ]
    history = [{key: sorted(row.get(key) or [], key=lambda u: u.encode('utf-16-be', errors='surrogatepass')) if key == 'sourceUrls' else row[key]
                for key in sorted(row, key=lambda k: k.encode('utf-16-be', errors='surrogatepass'))} for row in rows]
    evidence = {'quote': {'price': quote['lastPrice'], 'asOf': quote['timestamp'], 'source': quote.get('source')} if quote else None, 'history': history}
    snapshot_id = hashlib.sha256(stringify(evidence).encode('utf-8')).hexdigest()
    return {'methodVersion': METHOD_VERSION, 'snapshotId': snapshot_id,
            'status': 'incomplete' if any(i['severity'] == 'blocked' for i in issues) else 'limited' if issues else 'supported',
            'issues': issues, 'matrix': matrix, 'gaps': gaps, 'capabilities': capabilities, 'quoteAsOf': quote.get('timestamp') if quote else None,
            'methodology': 'Coverage describes available evidence, not investment quality or accuracy probability. No missing value is replaced with zero. Same evidence has the same snapshot ID; retrieval time is separate.'}
