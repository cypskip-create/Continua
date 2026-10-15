"""Draft official reopened-bond observations; accepted auction yield is not market yield."""
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from .reports import MONTHS
from .safaricom import short_date
from .numbers import finite


def draft_bond_report(text, source_url):
    url = urlsplit(source_url)
    if url.hostname not in ('centralbank.go.ke', 'www.centralbank.go.ke') or url.scheme != 'https' or url.username or url.password:
        raise ValueError('Expected official CBK HTTPS source')
    lines = [line.strip() for line in re.split(r'\r?\n', text)]
    issue_line = next((line for line in lines if re.match(r'ISSUE NUMBER\s', line, re.I)), '')
    issues = re.findall(r'(?:FXD\d|IFB\d|SDB\d)[/-]\d{4}[/-]\d{1,3}(?:\.\d+)?', issue_line)
    if not issues or len(set(issues)) != len(issues):
        raise ValueError('Issue columns need review')
    dates = re.findall(r'\b(\d{1,2})\s+(' + '|'.join(MONTHS) + r')\s+(20\d{2})\b', text, re.I)
    if not dates:
        raise ValueError('Signed report date missing')
    observed_date = short_date(*dates[-1])
    if observed_date < '2015-01-01' or observed_date > datetime.now(timezone.utc).date().isoformat():
        raise ValueError('Report date outside coverage')
    observed_at = observed_date + 'T00:00:00Z'
    def vector(pattern, required=True):
        line = next((line for line in lines if re.match(pattern, line, re.I)), None)
        if line is None:
            if required:
                raise ValueError('Required auction row missing')
            return None
        values = re.sub(pattern, '', line, count=1, flags=re.I).strip().split()
        if len(values) != len(issues) or not all(re.fullmatch(r'\d+(?:\.\d+)?', value) for value in values):
            raise ValueError('Auction columns are not aligned')
        numbers = [float(value) for value in values]
        if not all(finite(value) for value in numbers):
            raise ValueError('Nonfinite auction value')
        return numbers
    yields = vector(r'^Weighted Average Rate of Accepted Bids\s*\(%\)\s*')
    coupons = vector(r'^Coupon Rate\s*\(%\)\s*', False)
    prices = vector(r'^Price per Kshs\s*100 at average yield\s*', False)
    isin_line = next((line for line in lines if re.match(r'ISIN\s', line)), '')
    isins = re.findall(r'KE[A-Z0-9]{9}\d', isin_line)
    if len(isins) != len(issues) or len(set(isins)) != len(isins):
        raise ValueError('ISIN columns missing or duplicated')
    due_line = next((line for line in lines if re.match(r'Due Dates\s', line, re.I)), '')
    due = re.findall(r'\d{1,2}-[A-Za-z]{3}-\d{2,4}', due_line)
    if len(due) != len(issues):
        raise ValueError('Maturity columns need review')
    records = []
    for index, issue in enumerate(issues):
        day, month, year = due[index].split('-')
        year = int(year)
        maturity = short_date(day, month, 2000 + year if year < 100 else year) + 'T00:00:00Z'
        symbol = issue.replace('/', '-')
        tenor = float(re.split(r'[/-]', issue)[-1])
        if len(symbol) > 20 or not finite(tenor) or tenor <= 0 or (prices and prices[index] <= 0):
            raise ValueError('Invalid bond record')
        payload = {'tenor': tenor, 'yield': yields[index]}
        if coupons is not None:
            payload['coupon'] = coupons[index]
        if prices is not None:
            payload['price'] = prices[index]
        payload.update({'isin': isins[index], 'maturity': maturity, 'unit': 'KES per 100 face value', 'yieldBasis': 'accepted_auction'})
        records.append({'id': f'cbk:{symbol}:{observed_date}', 'kind': 'bond', 'title': symbol, 'symbol': symbol, 'observedAt': observed_at, 'sourceUrl': source_url, 'payload': payload})
    return records
