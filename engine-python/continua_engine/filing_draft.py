"""Review-only drafts. Guesses are never a publication authorization."""
import math
import re

FIELDS = {
    'income': {
        'revenue': ['revenue', 'turnover', 'total income', 'net sales'],
        'costOfRevenue': ['cost of revenue', 'cost of sales'],
        'grossProfit': ['gross profit'], 'operatingExpenses': ['operating expense'],
        'operatingIncome': ['operating income', 'operating profit'],
        'netIncome': ['net income', 'net profit', 'profit for the year', 'profit after tax'],
        'dilutedEps': ['diluted earnings per share', 'diluted eps'],
        'eps': ['earnings per share', 'eps'], 'ebitda': ['ebitda']},
    'balance': {
        'totalAssets': ['total assets'], 'totalLiabilities': ['total liabilities'],
        'totalEquity': ['total equity', "shareholders' equity", 'shareholders equity'],
        'cash': ['cash and cash equivalents', 'cash and bank'],
        'totalDebt': ['total debt', 'borrowings'], 'currentAssets': ['current assets'],
        'currentLiabilities': ['current liabilities'],
        'sharesOutstanding': ['shares outstanding', 'issued shares']},
    'cashflow': {
        'operatingCashFlow': ['cash flow from operating', 'net cash from operating', 'operating activities'],
        'investingCashFlow': ['cash flow from investing', 'investing activities'],
        'financingCashFlow': ['cash flow from financing', 'financing activities'],
        'freeCashFlow': ['free cash flow'], 'capex': ['capital expenditure', 'purchase of property']}}


def parse_number(raw):
    if not isinstance(raw, str) or not raw.strip() or raw.strip() in ('—', '-'):
        return None
    text = raw.strip()
    negative = text.startswith('(') and text.endswith(')')
    text = re.sub(r'[(),]', '', text)
    match = re.match(r'\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)', text)
    if not match:
        return None
    value = float(match[1])
    if not math.isfinite(value):
        return None
    return -abs(value) if negative else value


def filing_draft(candidate):
    table = candidate.get('detectedTable') or {}
    rows = table.get('rows') or []
    if not isinstance(rows, list) or len(rows) > 20000:
        raise ValueError('invalid filing rows')
    scores = dict.fromkeys(FIELDS, 0)
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('label'), str) or not isinstance(row.get('values'), list):
            raise ValueError('invalid filing row')
        label = ' '.join(row['label'].lower().split())
        for kind, fields in FIELDS.items():
            scores[kind] += sum(any(word in label for word in words) for words in fields.values())
    kind = max(scores, key=scores.get)

    def mapped_column(index):
        mapped, unmapped = {}, []
        for row in rows:
            label = ' '.join(row['label'].lower().split())
            field = next((field for field, words in FIELDS[kind].items() if any(word in label for word in words)), None)
            if field:
                mapped[field] = None if field in mapped else parse_number(row['values'][index] if index < len(row['values']) else None)
            else:
                unmapped.append(row)
        return {'mapped': mapped, 'unmapped': unmapped}

    year = None
    for text in (candidate.get('documentTitle'), table.get('title'), table.get('headerLine')):
        if isinstance(text, str) and (match := re.search(r'\b(20\d{2})\b', text, re.ASCII)):
            year = int(match[1])
            break
    count = min(20, max((len(row['values']) for row in rows), default=0))
    return {'statementType': kind, 'fiscalYear': year, **mapped_column(0),
            'historicalColumns': [{'columnIndex': i, **mapped_column(i)} for i in range(count)],
            'reviewWarning': 'Verify each column’s period, scope and units against the source filing. Drafts are not published facts.'}
