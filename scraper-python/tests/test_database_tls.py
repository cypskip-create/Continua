import hashlib
import pathlib
import ssl
import sys
import unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.database_tls import secure_connection
from psycopg.conninfo import conninfo_to_dict

class DatabaseTLSTests(unittest.TestCase):
    def test_neon_verifies_hostname_with_maintained_public_roots(self):
        import certifi
        actual=conninfo_to_dict(secure_connection('postgresql://fixture:fixture@ep-fixture.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'))
        self.assertEqual(actual['sslmode'],'verify-full')
        self.assertEqual(actual['sslrootcert'],certifi.where())
    def test_supabase_verifies_hostname_using_official_bundled_root(self):
        actual=conninfo_to_dict(secure_connection('postgresql://fixture:fixture@aws-1-eu-west-2.pooler.supabase.com/postgres?sslmode=require'))
        self.assertEqual(actual['sslmode'],'verify-full')
        pem=pathlib.Path(actual['sslrootcert']).read_text()
        self.assertEqual(hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest(),'807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa')
    def test_loopback_fixture_only_can_remain_plaintext(self):
        original='postgresql://fixture:fixture@127.0.0.1/fixture?sslmode=disable'
        self.assertEqual(secure_connection(original),original)
        with self.assertRaises(ValueError):secure_connection('postgresql://fixture:fixture@fixture.example/postgres?sslmode=disable')
    def test_explicit_root_and_nonprovider_boundaries(self):
        for host in ('fixture.example','pooler.supabase.com.attacker.example'):
            actual=conninfo_to_dict(secure_connection('postgresql://fixture:fixture@'+host+'/postgres'))
            self.assertEqual(actual['sslmode'],'verify-full')
            self.assertNotIn('sslrootcert',actual)
        actual=conninfo_to_dict(secure_connection('postgresql://fixture:fixture@db.fixture.supabase.co/postgres?sslrootcert=operator.crt'))
        self.assertEqual(actual['sslrootcert'],'operator.crt')
