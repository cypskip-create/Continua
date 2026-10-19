"""Native collector startup configuration. Values are never included in errors."""
import re
from urllib.parse import urlsplit


def boolean(value,default=False):
    if value is None or value=='':return default
    if not isinstance(value,str):raise ValueError('Invalid collector boolean configuration')
    normalized=value.lower()
    if normalized in ('true','1','yes'):return True
    if normalized in ('false','0','no'):return False
    raise ValueError('Invalid collector boolean configuration')


def validate_environment(environment):
    if environment.get('NODE_ENV','development') not in ('development','test','production'):
        raise ValueError('Invalid collector runtime environment')
    if environment.get('SCRAPER_WORKLOAD_ROLE','full') not in ('full','render-light'):
        raise ValueError('Invalid collector workload role')
    connection=environment.get('DATABASE_URL','')
    try:
        target=urlsplit(connection)
        if target.scheme not in ('postgres','postgresql') or not target.hostname:
            raise ValueError('Invalid collector database configuration')
    except Exception:
        raise ValueError('Invalid collector database configuration') from None
    if environment.get('PDF_NATIVE_ENGINE','poppler') not in ('poppler','python'):
        raise ValueError('Invalid native PDF configuration')
    # Native collection never selects local or Supabase for new originals.
    # The separate private legacy reader exists only for archive migration.
    if environment.get('RAW_STORAGE_DRIVER')!='r2':
        raise ValueError('Native collector requires private R2 original storage')
    for name in ('SCRAPER_ADMIN_API_KEY','COLLECTOR_MARKET_KEY'):
        value=environment.get(name,'')
        if value and (not isinstance(value,str) or not 32<=len(value)<=512 or value.strip()!=value):
            raise ValueError('Invalid collector credential configuration')
    if not re.fullmatch(r'[a-f0-9]{32}',environment.get('R2_ACCOUNT_ID','')):
        raise ValueError('Invalid private R2 account configuration')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',environment.get('R2_BUCKET','')):
        raise ValueError('Invalid private R2 bucket configuration')
    if not environment.get('R2_ACCESS_KEY_ID') or not environment.get('R2_SECRET_ACCESS_KEY'):
        raise ValueError('Private R2 credentials are required')
    try:upload_attempts=int(environment.get('R2_UPLOAD_ATTEMPTS','4'))
    except (TypeError,ValueError):raise ValueError('Invalid R2 retry reservation') from None
    if not 1<=upload_attempts<=4:raise ValueError('Invalid R2 retry reservation')
    for name,default,ceiling in (
        ('DOCUMENT_DRAIN_BATCH_SIZE',10,25),('EXTRACTION_SWEEP_BATCH_SIZE',50,100),
        ('R2_ARCHIVE_BATCH_SIZE',5,20)):
        try:value=int(environment.get(name,str(default)))
        except (TypeError,ValueError):raise ValueError('Invalid collector batch configuration') from None
        if not 1<=value<=ceiling:raise ValueError('Invalid collector batch configuration')
    from croniter import croniter
    for name,default in (
        ('NEWS_CRAWL_CRON','*/10 * * * *'),('DEFAULT_CRAWL_CRON','0 */6 * * *'),
        ('DOCUMENT_DRAIN_CRON','*/2 * * * *'),('EXTRACTION_SWEEP_CRON','*/15 * * * *'),
        ('R2_ARCHIVE_CRON','*/15 * * * *')):
        expression=environment.get(name,default)
        if not isinstance(expression,str) or len(expression)>200 or not croniter.is_valid(expression):
            raise ValueError('Invalid collector schedule configuration')
