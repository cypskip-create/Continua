"""Calendar-aligned OHLCV aggregation; never synthesizes missing bars."""
import datetime
import math
from .dates import parse, iso

FIXED_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "1d": 86400}

def bucket_start(date, interval):
    date = date.astimezone(datetime.timezone.utc)
    if interval == "1w":
        day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        return day - datetime.timedelta(days=day.weekday())
    if interval in FIXED_SECONDS:
        seconds = FIXED_SECONDS[interval]
        return datetime.datetime.fromtimestamp(math.floor(date.timestamp()/seconds)*seconds, datetime.timezone.utc)
    if interval == "1M":
        return date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if interval == "1y":
        return date.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    raise ValueError("unsupported_interval")

def aggregate_candles(source, interval):
    if not isinstance(source, list) or len(source) > 50000:
        raise ValueError("candle_limit")
    dated = []
    for candle in source:
        at = parse(candle.get("timestamp"))
        if at is None:
            raise ValueError("invalid_candle_date")
        dated.append((at, candle))
    dated.sort(key=lambda item: item[0])
    buckets = {}
    for date, candle in dated:
        key = bucket_start(date, interval)
        buckets.setdefault(key, []).append(candle)
    result = []
    for start, candles in sorted(buckets.items()):
        bar = {"securityId": candles[0]["securityId"], "interval": interval,
               "timestamp": iso(start), "open": candles[0]["open"], "close": candles[-1]["close"],
               "high": max(c["high"] for c in candles), "low": min(c["low"] for c in candles),
               "volume": sum(float(c["volume"]) if c["volume"] is not None else 0 for c in candles)}
        urls = [c.get("sourceUrl") for c in candles]
        if all(urls) and len(set(urls)) == 1:
            bar["sourceUrl"] = urls[0]
        result.append(bar)
    return result
