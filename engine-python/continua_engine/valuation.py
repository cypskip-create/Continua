"""Point-in-time annual filing ratios; no future filings or loss-based P/E."""
from .numbers import divide, positive

def annual_ratio_at(periods, price, at, ratio):
    if ratio not in ("pe","pb","ps"):
        raise ValueError("invalid_ratio")
    date = at[:10]
    eligible = [p for p in periods if p.get("periodEnd") and p["periodEnd"]<=date and p.get("reportedAt") and p["reportedAt"][:10]<=date]
    eligible.sort(key=lambda p:(p["fiscalYear"],p["reportedAt"]),reverse=True)
    p = eligible[0] if eligible else None
    shares = p.get("sharesOutstanding") if p else None
    eps = p.get("eps") if p else None
    if eps is None and positive(shares):
        eps = divide(p.get("netIncome"),shares)
    denominator = eps if ratio=="pe" else divide(p.get("totalEquity") if ratio=="pb" else p.get("revenue"),shares) if p and positive(shares) else None
    return {"ratio":price/denominator if p and positive(price) and positive(denominator) else None,
            "price":price,"fiscalYear":p.get("fiscalYear") if p else None,"reportedAt":p.get("reportedAt") if p else None,
            "denominator":denominator if positive(denominator) else None,"sourceUrls":(p.get("sourceUrls") or []) if p else []}
