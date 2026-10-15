"""Registered Safaricom layouts: literal group columns, units and reconciliations."""
import math
import re
from datetime import date
from .reports import report_number, confirmation, MONTHS

CONDENSED_VERSION = 'safaricom-condensed-group-v1'
PRESS_VERSION = 'safaricom-native-bn-comparatives-v1'
CELL = r'(?:\(\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?)'


def short_date(day, month, year):
    index = next((i for i, name in enumerate(MONTHS) if month.lower().startswith(name[:3])), None)
    if index is None:
        raise ValueError('Invalid financial date')
    return date(int(year), index + 1, int(day)).isoformat()


def accounting_row(rows, pattern, repeated=False):
    matches = [row for row in rows if re.fullmatch(pattern, row['label'], re.I)]
    if not matches or (not repeated and len(matches) != 1) or any(row['values'] != matches[0]['values'] for row in matches):
        raise ValueError('Missing or conflicting accounting row')
    return [report_number(value) for value in matches[0]['values'][:2]]


def condensed_group_report(text, issuer, security_id):
    if security_id != 'NSE:SCOM' or re.sub('[^a-z]', '', issuer.lower()) != 'safaricomplc' or not re.search(r'^\s*SAFARICOM\s+PLC\s+CONDENSED AUDITED RESULTS FOR THE\s*$', text, re.I | re.M):
        raise ValueError('Exact condensed issuer identity required')
    approvals = list(re.finditer(r'approved by the Board of Directors on (\d{1,2}) (\w+) (20\d{2})', text))
    if len(approvals) != 1:
        raise ValueError('Unique board approval required')
    reported_at = short_date(*approvals[0].groups())
    headings = list(re.finditer(r'Condensed consolidated statement\s+of\s+(profit or[\s\S]{0,90}?ended:|financial position as at:|cash flows for the year ended:)', text, re.I))
    if len(headings) != 3:
        raise ValueError('All three audited group statements required')
    entries = []
    for index, heading in enumerate(headings):
        block = text[heading.start():headings[index + 1].start() if index + 1 < len(headings) else len(text)]
        if not re.search(r'Group \(KShs Mn\)\s+Company \(KShs Mn\)', block):
            raise ValueError('Explicit group/company column order required')
        header = re.search(r'\s+'.join([r'(\d{1,2})-(\w{3})-(\d{2})'] * 4), block)
        if not header:
            raise ValueError('Four dated group/company columns required')
        cells = header.groups()
        ends = [short_date(cells[i * 3], cells[i * 3 + 1], '20' + cells[i * 3 + 2]) for i in range(4)]
        if ends[0] != ends[2] or ends[1] != ends[3] or ends[0][5:] != ends[1][5:] or int(ends[0][:4]) - int(ends[1][:4]) != 1:
            raise ValueError('Comparative dates or column scopes disagree')
        rows = []
        for line in re.split(r'\r?\n', block):
            parts = [cell.strip() for cell in re.split(r'\t+|\s{2,}', line.strip())]
            if len(parts) == 5 and all(re.fullmatch(r'\(?-?\d[\d,]*(?:\.\d+)?\)?', value) for value in parts[1:]):
                rows.append({'label': parts[0], 'values': parts[1:]})
        find = lambda pattern: accounting_row(rows, pattern, repeated=True)
        kind = 'balance' if heading[1].startswith('financial') else 'cashflow' if heading[1].startswith('cash') else 'income'
        if kind == 'income':
            mapped = {'revenue': find('Total Revenue'), 'netIncome': find('Profit for the year'), 'eps': find(r'Basic and diluted earnings per share \(EPS\)')}
            if any(abs(value) > 20 for value in mapped['eps']):
                raise ValueError('Unusual per-share scale requires review')
            before, tax = find('Profit before income tax'), find('Income tax expense')
            if any(mapped['revenue'][i] <= 0 or abs(before[i] - abs(tax[i]) - mapped['netIncome'][i]) > .3 for i in range(2)):
                raise ValueError('Income reconciliation failed')
            mapped['operatingIncome'] = find(r'Operating profit \(EBIT\)')
        elif kind == 'balance':
            mapped = {'totalAssets': find('Total assets'), 'totalEquity': find('Total equity'), 'totalLiabilities': find('Total liabilities')}
            if any(mapped['totalAssets'][i] <= 0 or abs(mapped['totalAssets'][i] - mapped['totalEquity'][i] - mapped['totalLiabilities'][i]) > .3 for i in range(2)):
                raise ValueError('Balance reconciliation failed')
        else:
            mapped = {'operatingCashFlow': find('Net cash generated from operating activities'), 'investingCashFlow': find('Net cash used in investing activities'), 'financingCashFlow': find('Net cash used in financing activities')}
            change = find(r'\(Decrease\)/Increase in cash and cash equivalents')
            if any(abs(sum(values[i] for values in mapped.values()) - change[i]) > .3 for i in range(2)):
                raise ValueError('Cash-flow reconciliation failed')
        body = {'securityId': security_id, 'statementType': kind, 'unitsVerified': True, 'periods': [
            {'columnIndex': i, 'period': {'periodType': 'annual', 'fiscalYear': int(end[:4]), 'periodEnd': end, 'reportedAt': reported_at, 'currency': 'KES'},
             kind: {field: values[i] * (1 if field == 'eps' else 1e6) for field, values in mapped.items()}, 'sourcePage': 1,
             'note': f'Automatic {CONDENSED_VERSION}: verified audited group columns, KES million units, dated comparatives and reconciled statements. EPS unscaled; group net income includes non-controlling interests.'}
            for i, end in enumerate(ends[:2])]}
        entries.append({'table': {'title': heading[0], 'headerLine': header[0], 'rows': rows, 'method': CONDENSED_VERSION, 'confidence': 1}, 'confirmation': confirmation(body)})
    return entries


def press_report(text, observed_at):
    if not re.search('SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016', text, re.I):
        raise ValueError('Unsupported legacy issuer results template')
    entries = []
    spans = [('Condensed consolidated statement of comprehensive income', 'Condensed consolidated statement of financial position', 'income', 6), ('Free Cash flow', None, 'cashflow', 8)]
    for start_label, end_label, kind, page in spans:
        start = text.find(start_label)
        end = text.find(end_label, start + len(start_label)) if end_label else len(text)
        if start < 0 or end < start:
            raise ValueError('Missing legacy results section')
        block = text[start:end]
        if not re.search('Kshs bn', block, re.I) or not re.search(r'31-Mar-16\s+31-Mar-15', block):
            raise ValueError('Explicit billion units and dated comparatives required')
        rows = []
        for line in re.split(r'\r?\n', block):
            match = re.fullmatch(r'(.+?)\s+(' + CELL + r')\s+(' + CELL + r')(?:\s+.*)?', line.strip())
            if match and re.search('[a-z]', match[1], re.I):
                rows.append({'label': match[1].strip(), 'values': [match[2], match[3]]})
        find = lambda pattern: accounting_row(rows, pattern)
        if kind == 'income':
            mapped = {'revenue': find('Total Revenue'), 'netIncome': find('Net Income'), 'ebitda': find('EBITDA')}
            before, tax = find('Earnings Before Taxation'), find('Taxation')
            if any(mapped['revenue'][i] <= 0 or abs(before[i] - abs(tax[i]) - mapped['netIncome'][i]) > .030001 for i in range(2)):
                raise ValueError('Legacy rounded tax reconciliation failed')
        else:
            mapped = {'freeCashFlow': find('Free cash flow'), 'capex': list(map(abs, find('Capital Additions')))}
        body = {'securityId': 'NSE:SCOM', 'statementType': kind, 'unitsVerified': True, 'periods': [
            {'columnIndex': i, 'period': {'periodType': 'annual', 'fiscalYear': year, 'periodEnd': f'{year}-03-31', 'reportedAt': observed_at, 'currency': 'KES'},
             kind: {field: math.floor(values[i] * 1e9 + .5) for field, values in mapped.items()}, 'sourcePage': page,
             'note': f'Automatic {PRESS_VERSION}: visually verified source template and KES billion comparative columns. Original release date is unknown; availability uses first archived observation {observed_at}. No EPS or CFO inferred.'}
            for i, year in enumerate([2016, 2015])]}
        entries.append({'table': {'title': start_label, 'headerLine': '31-Mar-16 31-Mar-15', 'rows': rows, 'method': PRESS_VERSION, 'confidence': 1}, 'confirmation': confirmation(body)})
    return entries
