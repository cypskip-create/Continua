"""Preserve JavaScript calculation rounding, without Python banker's rounding."""
import math

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def round4(value):
    if not finite(value) or not math.isfinite(value * 10000):
        return None
    return math.floor(value * 10000 + .5) / 10000

def divide(a, b):
    return a / b if finite(a) and finite(b) and b != 0 else None

def positive(value):
    return finite(value) and value > 0
