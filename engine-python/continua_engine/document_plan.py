"""Pure canonical publication plan. Database writes and locks belong to Go."""
import re
from urllib.parse import urlsplit
from .publisher import issuer_masthead_matches
from .reports import native_annual_report
from .safaricom import condensed_group_report, press_report
from .registered_reports import kakuzi_group_report, kcb_group_report, kakuzi_html_record
from .cbk import draft_bond_report


def publication_plan(row, issuers):
    try:
        return _plan(row, issuers)
    except ValueError as error:
        # Only deterministic source validation failures become review records.
        # Protocol/runtime/database failures remain retryable outside this plan.
        return {'valid': False, 'reason': str(error)[:400]}


def _plan(row, issuers):
    html = row['method'] == 'html' and row['sourceId'] == 'kakuzi-record-filings'
    if row['method'] != 'native_pdf_text' and not html:
        raise ValueError('OCR or unknown non-native extraction requires visual review')
    if row['method'] == 'native_pdf_text' and row.get('needsReview') is True:
        raise ValueError('Incomplete native PDF extraction requires review; not eligible for automatic publication')
    url = urlsplit(row['sourceUrl'])
    if url.scheme != 'https' or url.username or url.password or not url.hostname:
        raise ValueError('Registered HTTPS provenance required')
    host = re.sub(r'^www\.', '', url.hostname)
    if html and (host != 'kakuzi.co.ke' or url.path != '/five-year-record' or url.query or url.fragment):
        raise ValueError('Exact registered Kakuzi record URL required')
    text = row['text']
    if row['sourceId'] == 'cbk-bond-history':
        if not re.match(r'RESULTS FOR REOPENED\b', text.strip(), re.I) or not re.search(r'Director,?\s+Financial Markets', text, re.I):
            raise ValueError('Unsupported CBK signed-results layout')
        records = draft_bond_report(text, row['sourceUrl'])
        for record in records:
            p = record['payload']
            if p.get('coupon') is None or not p.get('price') or p['yield'] <= 0 or p['yield'] > 100 or p['coupon'] > 100 or p['price'] > 300 or p['tenor'] > 50 or p['maturity'] <= record['observedAt']:
                raise ValueError('Bond range, maturity or required inputs failed')
        return {'valid': True, 'kind': 'bond', 'records': records}
    domains = (row.get('config') or {}).get('allowedDomains') or []
    allowed = host == 'nse.co.ke' if row['sourceId'] == 'nse' else host == 'assets.kenyanstocks.com' if row['sourceId'] == 'kenyanstocks' else any(host == re.sub(r'^www\.', '', domain) for domain in domains)
    if not allowed:
        raise ValueError('Source host outside registered issuer archive')
    normalize = lambda value: re.sub(r'[^a-z0-9]', '', value.lower())
    header = normalize(text.encode('utf-16-le', errors='surrogatepass')[:8000].decode('utf-16-le', errors='surrogatepass'))
    explicit_safaricom = bool(re.search(r'^\s*SAFARICOM\s+PLC\s+CONDENSED AUDITED RESULTS FOR THE\s*$', text, re.I | re.M) or re.search('SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016', text, re.I))
    explicit_kakuzi = bool(re.search(r'^\s*KAKUZI PLC\s*$', text, re.I | re.M) and re.search(r'ANNOUNCEMENT OF GROUP RESULTS FOR THE YEAR ENDED\s+31 DECEMBER 2017', text, re.I))
    explicit_kcb = 'KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES' in text and 'FOR THE YEAR ENDED 31ST DECEMBER 2017' in text
    mastheads = [issuer['id'] for issuer in issuers if issuer_masthead_matches(text, issuer['name'])]
    def match(issuer):
        if html: return issuer['id'] == 'NSE:KUKZ'
        if explicit_safaricom: return issuer['id'] == 'NSE:SCOM'
        if explicit_kakuzi: return normalize(issuer['name']) == 'kakuziplc'
        if explicit_kcb: return issuer['id'] == 'NSE:KCB'
        if mastheads: return issuer['id'] in mastheads
        return bool(normalize(issuer['name'])) and normalize(issuer['name']) in header
    matches = [issuer for issuer in issuers if match(issuer)]
    if len(matches) != 1:
        raise ValueError('Unique exact issuer identity required')
    issuer = matches[0]
    if html:
        entries = kakuzi_html_record(text, row['tables'], issuer['id'], row['observedDate'])
    elif explicit_kcb:
        entries = kcb_group_report(text, issuer['id'])
    elif explicit_kakuzi:
        entries = kakuzi_group_report(text, issuer['id'])
    elif issuer['id'] == 'NSE:SCOM' and 'CONDENSED AUDITED RESULTS FOR THE' in text:
        entries = condensed_group_report(text, issuer['name'], issuer['id'])
    elif issuer['id'] == 'NSE:SCOM' and re.search('SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016', text, re.I):
        entries = press_report(text, row['observedDate'])
    else:
        entries = native_annual_report(text, issuer['name'], issuer['id'])
    return {'valid': True, 'kind': 'financial', 'issuer': issuer, 'entries': entries}
