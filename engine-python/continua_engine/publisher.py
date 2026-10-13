"""Strict publisher observations, kept separate from canonical reviewed filings."""
import datetime
import re

def bounded_string(value, maximum):
    return isinstance(value, str) and len(value.encode("utf-16-le", errors="surrogatepass"))//2 <= maximum

def source_financial_tables(raw, year=None):
    year = year if year is not None else datetime.datetime.now(datetime.timezone.utc).year
    if not isinstance(raw, list):
        return []
    result = []
    for table in raw:
        if not isinstance(table, dict) or table.get("kind") != "publisher_table" or table.get("tab") != "Financials" or not bounded_string(table.get("category"), 60):
            continue
        columns, rows = table.get("columns"), table.get("rows")
        if not isinstance(columns, list) or not 2 <= len(columns) <= 25 or not all(bounded_string(c, 80) for c in columns) or not isinstance(rows, list) or len(rows) > 500:
            continue
        years = columns[1:]
        if len(set(years)) != len(years) or not all(re.fullmatch(r"20[0-9]{2}", y) and 2015 <= int(y) <= year for y in years):
            continue
        parsed = []
        for row in rows:
            if not isinstance(row, dict) or not bounded_string(row.get("label"), 500) or row.get("rowKind") not in ("item", "total", "group"):
                break
            cells = row.get("cells")
            if not isinstance(cells, list) or len(cells) > 24 or not all(isinstance(c, dict) and bounded_string(c.get("raw"), 100) for c in cells):
                break
            if row["rowKind"] != "group" and len(cells) != len(years):
                break
            parsed.append({"label": row["label"], "rowKind": row["rowKind"], "values": [c["raw"] for c in cells]})
        else:
            result.append({"category": table["category"], "columns": columns, "rows": parsed})
    return result

def legal_issuer_identity(value):
    if not isinstance(value, str):
        return ""
    name = re.sub(r"[^a-z0-9 ]", " ", value.lower().replace("&", "and")).strip()
    name = re.sub(r"\s+(?:public limited company|plc|limited|ltd)\s*$", "", name)
    return re.sub(r"\s+", "", name)

def issuer_masthead_matches(text, name):
    target = legal_issuer_identity(name)
    if not target:
        return False
    clipped=text.encode("utf-16-le",errors="surrogatepass")[:8000].decode("utf-16-le",errors="surrogatepass")
    for line in re.split(r"\r?\n",clipped):
        masthead = re.sub(r"\s+(?:audited|unaudited|consolidated|condensed|annual|financial|results)\b.*$", "", line.strip(), flags=re.I)
        if legal_issuer_identity(masthead) == target:
            return True
    return False

def profile_observation(tables, company_name):
    if not isinstance(tables, list):
        return None
    profile = next((t for t in tables if isinstance(t, dict) and t.get("kind") == "publisher_profile"), None)
    if profile is None or not isinstance(profile.get("companyName"),str) or not isinstance(company_name,str) or legal_issuer_identity(profile.get("companyName")) != legal_issuer_identity(company_name):
        return None
    facts = profile.get("facts") or {}
    if not isinstance(facts, dict):
        return None
    website = facts.get("website")
    if not isinstance(website, str) or not re.fullmatch(r"(?:https?://)?[a-z0-9.-]+(?:/[a-z0-9/_-]*)?", website, re.I):
        website = None
    return {"headquarters": facts["address"] if isinstance(facts.get("address"), str) else None, "website": website}
