"""Private Supabase -> private R2 copy. No deletion and no DB pointer cutover.

Python is used for streamed hashing, resumable SQLite auditing and storage
inventory. Run dry-run first; --copy explicitly enables remote writes.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError('Private storage redirects are not permitted')


def validate_key(key):
    if not key or '\\' in key or any(part in ('', '.', '..') for part in key.split('/')) or any(c in key for c in '?\x00#'):
        raise ValueError('Invalid financial artifact key')
    return key


def verified_bytes(body, expected_hash, expected_size):
    if len(body) != expected_size or hashlib.sha256(body).hexdigest() != expected_hash:
        raise ValueError('Financial artifact integrity mismatch')
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--copy', action='store_true')
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--after-id', type=int, default=0)
    parser.add_argument('--journal', default='.qa-artifacts/r2-migration.sqlite')
    args = parser.parse_args()
    if not 1 <= args.limit <= 10000:
        parser.error('limit must be 1..10000')
    if args.after_id < 0:
        parser.error('after-id must be nonnegative')
    from dotenv import load_dotenv
    import psycopg
    import boto3
    from botocore.exceptions import ClientError
    load_dotenv('backend/.env.local')
    bucket = os.environ.get('SUPABASE_STORAGE_BUCKET', 'scraper-raw')
    if bucket != 'scraper-raw':
        raise ValueError('Migration is restricted to the private financial archive')
    r2_bucket = os.environ['R2_BUCKET'] if args.copy else None
    journal_path = Path(args.journal)
    journal_path.parent.mkdir(parents=True, exist_ok=True)
    journal = sqlite3.connect(journal_path)
    journal.execute('CREATE TABLE IF NOT EXISTS copies(artifact_id INTEGER PRIMARY KEY, sha256 TEXT, size INTEGER, object_key TEXT, verified_at REAL)')
    with psycopg.connect(os.environ['DATABASE_URL']) as db:
        rows = db.execute("SELECT id,sha256,size_bytes,storage_path FROM scraping.raw_artifacts WHERE id>%s AND content_type LIKE 'application/pdf%' AND storage_path NOT LIKE 'r2://%' AND size_bytes>0 AND size_bytes<=52428800 ORDER BY id LIMIT %s", (args.after_id, args.limit)).fetchall()
    report = {'inventoried': len(rows), 'copied': 0, 'already_verified': 0, 'failed': 0, 'mode': 'copy' if args.copy else 'dry-run'}
    report['next_after_id'] = rows[-1][0] if rows else args.after_id
    if not args.copy:
        report['bytes'] = sum(row[2] for row in rows)
        print(json.dumps(report))
        return
    account = os.environ['R2_ACCOUNT_ID']
    if not re.fullmatch('[a-f0-9]{32}', account):
        raise ValueError('Invalid R2 account')
    s3 = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com', region_name='auto', aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'], aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'])
    source = urllib.parse.urlsplit(os.environ['SUPABASE_URL'])
    if source.scheme != 'https' or source.username or source.password or source.query or source.fragment:
        raise ValueError('Invalid private storage origin')
    for artifact_id, checksum, size, key in rows:
        try:
            validate_key(key)
            if not re.fullmatch('[a-f0-9]{64}', checksum):
                raise ValueError('Invalid archive checksum')
            # Re-verify even an earlier journal entry; a stale audit is not
            # permission to update canonical storage references.
            try:
                stored = s3.get_object(Bucket=r2_bucket, Key=key)['Body'].read(size + 1)
                verified_bytes(stored, checksum, size)
                report['already_verified'] += 1
            except ClientError as error:
                if error.response['Error']['Code'] not in ('NoSuchKey', '404'):
                    raise
                url = f'{source.scheme}://{source.netloc}/storage/v1/object/{bucket}/' + '/'.join(urllib.parse.quote(part, safe='') for part in key.split('/'))
                token = os.environ['SUPABASE_SERVICE_ROLE_KEY']
                request = urllib.request.Request(url, headers={'apikey': token, 'Authorization': f'Bearer {token}'})
                with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
                    body = verified_bytes(response.read(size + 1), checksum, size)
                if not body.lstrip().startswith(b'%PDF-'):
                    raise ValueError('Non-PDF bytes rejected')
                s3.put_object(Bucket=r2_bucket, Key=key, Body=io.BytesIO(body), ContentType='application/pdf', Metadata={'sha256': checksum}, IfNoneMatch='*')
                verified_bytes(s3.get_object(Bucket=r2_bucket, Key=key)['Body'].read(size + 1), checksum, size)
                report['copied'] += 1
            journal.execute('INSERT OR REPLACE INTO copies VALUES(?,?,?,?,?)', (artifact_id, checksum, size, key, time.time()))
            journal.commit()
        except Exception:
            # Never print signed URLs, auth headers or exception payloads.
            report['failed'] += 1
            print(json.dumps({'artifact_id': artifact_id, 'error': 'copy_or_integrity_failed'}))
    print(json.dumps(report))
    if report['failed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
