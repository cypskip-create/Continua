"""Source-specific audited layouts. Parent and bank columns never become group data."""
import re
from .reports import report_number, confirmation

KAKUZI_VERSION = 'kakuzi-group-annual-v1'
KCB_VERSION = 'kcb-six-column-group-2017-v1'
KAKUZI_HTML_VERSION = 'kakuzi-five-year-html-2025-v1'


def kakuzi_html_record(text, tables, security_id, observed_date):
    if security_id != 'NSE:KUKZ' or 'Five Year Record' not in text or not re.search(r"All amounts are stated in Kenyan shillings thousands \(shs[’']000\) except where otherwise indicated\.", text, re.I):
        raise ValueError('Kakuzi HTML identity and explicit units required')
    matches = [t for t in tables if t.get('method') == 'html_table_v1' and re.sub(r'\s+', '', t.get('headerLine') or '') == "|2025Shs'000|2024Shs'000|2023Shs'000|2022Shs'000|2021Shs'000"]
    if len(matches) != 1:
        raise ValueError('Exact verified five-year column order required')
    table = matches[0]
    def find(pattern):
        rows = [row for row in table['rows'] if re.fullmatch(pattern, row['label'])]
        if len(rows) != 1 or len(rows[0]['values']) != 5:
            raise ValueError('Unique complete five-year row required')
        return [report_number(value) for value in rows[0]['values']]
    revenue, net_income, eps = find('Turnover'), find(r'\(Loss\)/Profit attributable to the members of Kakuzi Plc'), find(r'Basic earnings per ordinary share \(Shs\)')
    other, total = find('Other comprehensive income'), find(r'Total comprehensive\(Loss\)/income')
    sign = lambda value: (value > 0) - (value < 0)
    if any(abs(net_income[i] + other[i] - total[i]) > 1 or revenue[i] <= 0 or sign(eps[i]) != sign(net_income[i]) for i in range(5)):
        raise ValueError('Comprehensive income or earnings reconciliation failed')
    body = {'securityId': security_id, 'statementType': 'income', 'unitsVerified': True, 'periods': [
        {'columnIndex': i, 'period': {'periodType': 'annual', 'fiscalYear': year, 'periodEnd': f'{year}-12-31', 'reportedAt': observed_date, 'currency': 'KES'},
         'income': {'revenue': revenue[i] * 1000, 'netIncome': net_income[i] * 1000, 'eps': eps[i]}, 'sourcePage': 1,
         'note': f'{KAKUZI_HTML_VERSION}: official issuer five-year record; turnover and attributable earnings in KES thousands, EPS in shillings. Net earnings plus other comprehensive income reconciles to total comprehensive income. December fiscal year verified against issuer annual report. Conservative availability is first archive observation, not original release date. Equity-only row cannot establish a full balance sheet; no cash flow or balance sheet invented.'}
        for i, year in enumerate([2025, 2024, 2023, 2022, 2021])]}
    return [{'table': table, 'confirmation': confirmation(body)}]


def kakuzi_group_report(text, security_id):
    if security_id != 'NSE:KUKZ' or not re.search(r'^\s*KAKUZI PLC\s*$', text, re.I | re.M) or not re.search(r'ANNOUNCEMENT OF GROUP RESULTS FOR THE YEAR ENDED\s+31 DECEMBER 2017', text, re.I) or not re.search('audited by Deloitte & Touche', text, re.I) or not re.search(r'BY ORDER OF THE BOARD\s+G H Mclean\s+Chairman\s+22 March 2018', text, re.I):
        raise ValueError('Unsupported Kakuzi audited masthead or board date')
    income_start = text.find('Condensed consolidated statement of profit or loss')
    match = re.search('Condensed Consolidated Statement of Financial Position', text, re.I)
    balance_start = match.start() if match else -1
    end = text.find('OVERVIEW:')
    if income_start < 0 or balance_start <= income_start or end <= balance_start:
        raise ValueError('Unique ordered Kakuzi statement blocks required')
    entries = []
    for kind in ['income', 'balance']:
        block = text[income_start:balance_start] if kind == 'income' else text[balance_start:end]
        if len(re.findall(r'31 December 2017\s+31 December 2016', block)) != 1 or block.count('Shs’000') != 2:
            raise ValueError('Exact comparative order and KES thousands required')
        rows = []
        for line in block.split('\n'):
            cells = [re.sub(r'\s+\)', ')', cell.strip()) for cell in re.split(r'\t+|\s{2,}', line.strip())]
            if len(cells) == 3 and all(re.fullmatch(r'\(?\d[\d,]*(?:\.\d+)?\)?', v) for v in cells[1:]):
                rows.append({'label': cells[0], 'values': cells[1:]})
        def find(pattern):
            matches = [row for row in rows if re.fullmatch(pattern, row['label'])]
            if len(matches) != 1:
                raise ValueError('Missing or duplicate accounting row')
            return [report_number(v) for v in matches[0]['values']]
        if kind == 'income':
            mapped = {'revenue': find('Sales'), 'netIncome': find('Profit for the year'), 'eps': find('Basic and diluted earnings per ordinary share')}
            if 'Earnings per share (Shs):' not in block:
                raise ValueError('Unscaled EPS units required')
            before, tax = find('Profit before income tax'), find('Income tax expense')
            if any(abs(before[i] - abs(tax[i]) - mapped['netIncome'][i]) > 2 for i in range(2)):
                raise ValueError('Income tax reconciliation failed')
        else:
            mapped = {'totalEquity': find('Total equity'), 'cash': find('Cash and bank balances')}
            noncurrent, current = find('Non-current assets'), find('Current assets')
            noncurrent_liabilities, current_liabilities, netcurrent = find('Non-current liabilities'), find('Current liabilities'), find('Net current assets')
            mapped['currentAssets'] = [v + mapped['cash'][i] for i, v in enumerate(current)]
            mapped['currentLiabilities'] = list(map(abs, current_liabilities))
            mapped['totalAssets'] = [v + mapped['currentAssets'][i] for i, v in enumerate(noncurrent)]
            mapped['totalLiabilities'] = [v + mapped['currentLiabilities'][i] for i, v in enumerate(noncurrent_liabilities)]
            if any(abs(mapped['totalAssets'][i] - mapped['totalLiabilities'][i] - mapped['totalEquity'][i]) > 2 or abs(netcurrent[i] - mapped['currentAssets'][i] + mapped['currentLiabilities'][i]) > 2 for i in range(2)):
                raise ValueError('Gross assets or net-current reconciliation failed')
        body = {'securityId': security_id, 'statementType': kind, 'unitsVerified': True, 'periods': [
            {'columnIndex': i, 'period': {'periodType': 'annual', 'fiscalYear': year, 'periodEnd': f'{year}-12-31', 'reportedAt': '2018-03-22', 'currency': 'KES'},
             kind: {field: values[i] * (1 if field == 'eps' else 1000) for field, values in mapped.items()}, 'sourcePage': 1,
             'note': f'{KAKUZI_VERSION}: audited group comparative columns; unscaled EPS. Gross current assets include separately presented cash; gross total assets and liabilities reconstructed from the net-assets presentation and reconciled against equity. No cash flow is reported.'}
            for i, year in enumerate([2017, 2016])]}
        entries.append({'table': {'title': kind, 'headerLine': '31 December 2017 / 31 December 2016', 'rows': rows, 'method': KAKUZI_VERSION, 'confidence': 1}, 'confirmation': confirmation(body)})
    return entries


def kcb_group_report(text, security_id):
    if security_id != 'NSE:KCB' or not re.search('financial statements were approved by the Board of Directors on Wednesday, 7 March, 2018', text, re.I) or not re.search(r'audited by\s+KPMG-Kenya', text, re.I):
        raise ValueError('Exact KCB audit and approval date required')
    pages = text.split('\f')
    if len(pages) != 3:
        raise ValueError('Three-page KCB audited layout required')
    for page in pages:
        if 'KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES' not in page or 'FOR THE YEAR ENDED 31ST DECEMBER 2017' not in page or not re.search(r'BANK\s+KCB GROUP PLC -COMPANY\s+KCB GROUP PLC-CONSOLIDATED', page):
            raise ValueError('KCB scope masthead changed')
        headers = [line for line in page.split('\n') if re.fullmatch(r'\s*31-Dec-16\s+31-Dec-17\s+31-Dec-16\s+31-Dec-17\s+31-Dec-16\s+31-Dec-17\s*', line)]
        if len(headers) != 1 or not re.search(r'^\s*' + r'\s+'.join(['Kshs 000'] * 6) + r'\s*$', page, re.I | re.M):
            raise ValueError('Six ordered dated KES columns required')
    entries = []
    for page_index, kind in [(0, 'balance'), (1, 'income')]:
        rows = []
        for line in pages[page_index].split('\n'):
            cells = re.split(r'\s{2,}', line.strip())
            if len(cells) == 7 and all(v == '-' or re.fullmatch(r'\(?-?\d[\d,]*(?:\.\d+)?\)?', v) for v in cells[1:]):
                rows.append({'label': re.sub(r'^\d+(?:\.\d+)?\s+', '', cells[0]), 'values': cells[1:]})
        def find(pattern, insensitive=False):
            matches = [row for row in rows if re.fullmatch(pattern, row['label'], re.I if insensitive else 0)]
            if len(matches) != 1 or '-' in matches[0]['values'][4:]:
                raise ValueError('Missing or ambiguous required KCB group value')
            return [report_number(v) for v in matches[0]['values'][4:]]
        if kind == 'balance':
            mapped = {'totalAssets': find('TOTAL ASSETS'), 'totalLiabilities': find('TOTAL LIABILITIES'), 'totalEquity': find("TOTAL SHAREHOLDERS' FUNDS")}
            if any(abs(mapped['totalAssets'][i] - mapped['totalLiabilities'][i] - mapped['totalEquity'][i]) > 3 for i in range(2)):
                raise ValueError('Group assets do not reconcile')
        else:
            mapped = {'revenue': find('TOTAL OPERATING INCOME'), 'netIncome': find(r'Profit/\(loss\) after tax and exceptional items', True), 'eps': find('EARNINGS PER SHARE- DILUTED & BASIC KSHS'), 'operatingExpenses': find('Total other operating expenses', True)}
            interest, other = find(r'NET INTEREST INCOME/\(LOSS\)'), find('Total other operating income', True)
            before, current_tax, deferred_tax = find(r'Profit/\(loss\) after exceptional items', True), find('Current tax', True), find('Deferred tax', True)
            if any(abs(mapped['revenue'][i] - interest[i] - other[i]) > 3 or abs(before[i] + current_tax[i] + deferred_tax[i] - mapped['netIncome'][i]) > 3 for i in range(2)):
                raise ValueError('Group income or tax reconciliation failed')
        body = {'securityId': security_id, 'statementType': kind, 'unitsVerified': True, 'periods': [
            {'columnIndex': 4 + i, 'period': {'periodType': 'annual', 'fiscalYear': year, 'periodEnd': f'{year}-12-31', 'reportedAt': '2018-03-07', 'currency': 'KES'},
             kind: {field: values[i] * (1 if field == 'eps' else 1000) for field, values in mapped.items()}, 'sourcePage': page_index + 1,
             'note': f'{KCB_VERSION}: native audited statement, only final two consolidated columns; KES thousands, unscaled EPS; board date and accounting equations verified. Bank-only and parent-company figures excluded. No cash-flow statement supplied.'}
            for i, year in enumerate([2016, 2017])]}
        entries.append({'table': {'title': f'KCB group {kind}', 'headerLine': 'Bank 2016/17; Company 2016/17; Consolidated 2016/17', 'rows': rows, 'method': KCB_VERSION, 'confidence': 1}, 'confirmation': confirmation(body)})
    return entries
