import datetime

def parse(value):
    if not isinstance(value,str):
        return None
    try:
        result=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
        return result.replace(tzinfo=datetime.timezone.utc) if result.tzinfo is None else result
    except ValueError:
        return None

def iso(value):
    return value.astimezone(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def prior_year(value):
    try:
        return value.replace(year=value.year-1)
    except ValueError:
        # JS setUTCFullYear normalizes February 29 to March 1 in a non-leap year.
        return value.replace(year=value.year-1,month=3,day=1)
