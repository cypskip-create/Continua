"""Compatibility evidence encoding. Preserve JS key/number/string wire semantics."""
import json
import math
import re


def number_text(value):
    value = float(value)
    if not math.isfinite(value):
        return 'null'
    if value == 0:
        return '0'
    sign = '-' if value < 0 else ''
    value = abs(value)
    raw = repr(value).lower()
    if 'e' in raw:
        coefficient, exponent = raw.split('e')
        exponent = int(exponent)
    else:
        coefficient, exponent = raw, 0
    whole, _, fraction = coefficient.partition('.')
    digits = (whole + fraction).lstrip('0')
    position = len(whole) + exponent
    # repr emits ordinary sub-unit decimals with leading zeroes.
    leading = len(whole + fraction) - len((whole + fraction).lstrip('0'))
    position -= leading
    digits = digits.rstrip('0') or '0'
    if 1e-6 <= value < 1e21:
        if position <= 0:
            return sign + '0.' + '0' * (-position) + digits
        if position >= len(digits):
            return sign + digits + '0' * (position - len(digits))
        return sign + digits[:position] + '.' + digits[position:]
    exponent = position - 1
    tail = '.' + digits[1:] if len(digits) > 1 else ''
    return sign + digits[0] + tail + 'e' + ('+' if exponent >= 0 else '') + str(exponent)


def string_text(value):
    # JSON.stringify escapes lone UTF-16 surrogates, but retains real Unicode.
    value = value.encode('utf-16-le', errors='surrogatepass').decode('utf-16-le', errors='surrogatepass')
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return re.sub('[\ud800-\udfff]', lambda m: '\\u' + format(ord(m[0]), '04x'), raw)


def stringify(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return number_text(value)
    if isinstance(value, str):
        return string_text(value)
    if isinstance(value, list):
        return '[' + ','.join(stringify(item) for item in value) + ']'
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError('Evidence keys must be strings')
        # ECMAScript enumerates integer-index keys first, even after an ordered
        # Object.fromEntries construction. Ordinary string insertion order stays.
        indices = sorted((key for key in value if re.fullmatch(r'0|[1-9]\d*', key) and int(key) < 4294967295), key=int)
        keys = indices + [key for key in value if key not in indices]
        return '{' + ','.join(string_text(key) + ':' + stringify(value[key]) for key in keys) + '}'
    raise ValueError('Unsupported evidence value')
