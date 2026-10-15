"""Verify database hostname and certificate chain before authentication."""
from pathlib import Path

def secure_connection(connection):
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    settings=conninfo_to_dict(connection)
    host=settings.get('host','')
    if host in ('localhost','127.0.0.1','::1') or host.startswith('/'):
        return connection
    if not host or ',' in host:
        raise ValueError('Native collector requires one verified database host')
    if settings.get('sslmode')=='disable':
        raise ValueError('Remote collector database requires verified TLS')
    settings['sslmode']='verify-full'
    supabase=host.endswith('.pooler.supabase.com') or (host.startswith('db.') and host.endswith('.supabase.co'))
    if supabase and not settings.get('sslrootcert'):
        settings['sslrootcert']=str(Path(__file__).with_name('supabase-root-2021.crt'))
    return make_conninfo(**settings)
