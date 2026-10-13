"""Native SMA, EMA, Wilder RSI, MACD and crossover compatibility ports."""
from .numbers import finite, round4

def closes(candles, period):
    if not isinstance(period, int) or isinstance(period, bool) or not 1 <= period <= 500:
        raise ValueError("invalid_indicator_period")
    if not isinstance(candles, list) or len(candles) > 50000:
        raise ValueError("invalid_candle_count")
    values = [c.get("close") for c in candles]
    if not all(finite(v) for v in values):
        raise ValueError("invalid_candle_close")
    return values

def sma(candles, period):
    values = closes(candles, period)
    return [None if i < period - 1 else round4(sum(values[i-period+1:i+1]) / period)
            for i in range(len(values))]

def ema(candles, period):
    values = closes(candles, period)
    result = [None] * len(values)
    if len(values) < period:
        return result
    weight = 2 / (period + 1)
    result[period-1] = round4(sum(values[:period]) / period)
    for i in range(period, len(values)):
        result[i] = round4(values[i] * weight + result[i-1] * (1-weight))
    return result

def rsi(candles, period=14):
    values = closes(candles, period)
    result = [None] * len(values)
    if len(values) <= period:
        return result
    changes = [values[i]-values[i-1] for i in range(1, period+1)]
    gain = sum(max(v, 0) for v in changes) / period
    loss = sum(max(-v, 0) for v in changes) / period
    value = lambda: 100 if loss == 0 else round4(100-100/(1+gain/loss))
    # Compatibility: the current Engine returns 100 for a perfectly flat series.
    result[period] = value()
    for i in range(period+1, len(values)):
        delta = values[i]-values[i-1]
        gain = (gain*(period-1)+max(delta, 0))/period
        loss = (loss*(period-1)+max(-delta, 0))/period
        result[i] = value()
    return result

def macd(candles, fast=12, slow=26, signal_period=9):
    a, b = ema(candles, fast), ema(candles, slow)
    line = [round4(f-s) if f is not None and s is not None else None for f, s in zip(a,b)]
    compact = ema([{"close":v} for v in line if v is not None], signal_period)
    signal, index = [], 0
    for value in line:
        signal.append(compact[index] if value is not None else None)
        if value is not None:
            index += 1
    histogram = [round4(m-s) if m is not None and s is not None else None for m, s in zip(line,signal)]
    return {"macd":line, "signal":signal, "histogram":histogram}

def latest_crossover(fast, slow):
    count = len(fast)
    if count < 2 or len(slow) < count:
        return None
    f0, f1, s0, s1 = fast[count-2], fast[count-1], slow[count-2], slow[count-1]
    if any(v is None for v in (f0, f1, s0, s1)):
        return None
    if f0 <= s0 and f1 > s1:
        return "bullish"
    if f0 >= s0 and f1 < s1:
        return "bearish"
    return None
