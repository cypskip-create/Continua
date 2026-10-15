"""Offline deterministic Engine CLI. Never shadows Python's operator module."""
import argparse
import json
import pathlib
import sys
from continua_engine.cbk import draft_bond_report


def run(argv):
    parser=argparse.ArgumentParser(description='Native offline Continua Engine operator')
    parser.add_argument('--operation',required=True,choices=('draft-bond-report',))
    parser.add_argument('--input',required=True)
    parser.add_argument('--source-url',required=True)
    args=parser.parse_args(argv)
    path=pathlib.Path(args.input)
    if not path.is_file() or path.stat().st_size>8*1024*1024:
        raise ValueError('Bounded extracted source text required')
    # The report parser checks exact official source domains and validates
    # literal dates, issue columns and yields. A draft is never publication.
    raw=path.read_bytes()
    if len(raw)>8*1024*1024:raise ValueError('Source text exceeded limit')
    return {'mode':'draft-only','published':False,'records':draft_bond_report(raw.decode('utf-8'),args.source_url)}


def main():
    try:
        print(json.dumps(run(sys.argv[1:]),allow_nan=False,ensure_ascii=False,separators=(',',':')))
        return 0
    except Exception:
        print('{"error":"native_engine_draft_failed"}',file=sys.stderr)
        return 1


if __name__=='__main__':raise SystemExit(main())
