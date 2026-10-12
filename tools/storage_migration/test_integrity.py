import hashlib
import unittest
from migrate_financial_documents import validate_key, verified_bytes

class IntegrityTest(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(validate_key('nse/2026/report.pdf'), 'nse/2026/report.pdf')
        for key in ('../private', 'nse//file', 'nse\\private', '/file', 'file?token=x'):
            with self.assertRaises(ValueError): validate_key(key)
    def test_checksum_and_size(self):
        body = b'PDF fixture'
        digest = hashlib.sha256(body).hexdigest()
        self.assertEqual(verified_bytes(body, digest, len(body)), body)
        with self.assertRaises(ValueError): verified_bytes(body, '0'*64, len(body))
        with self.assertRaises(ValueError): verified_bytes(body, digest, 1)

if __name__ == '__main__': unittest.main()
