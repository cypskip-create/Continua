import hashlib
import io
import pathlib
import sys
import tempfile
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.storage import PrivateSupabaseStorage, RawStorage
from continua_scraper.download import Artifact


class Response:
    def __init__(self, data, status=200, headers=None):
        self.stream = io.BytesIO(data)
        self.status = status
        self.headers = headers or {'Content-Length': str(len(data)), 'Content-Type': 'application/pdf'}
        self.closed = self.released = False
        self.chunks = []
    def read(self, size, **kwargs):
        self.chunks.append(size)
        return self.stream.read(size)
    def close(self): self.closed = True
    def release_conn(self): self.released = True


class Client:
    def __init__(self, response): self.response = response; self.calls = []; self.cleared = False
    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if method == 'POST':
            self.uploaded = kwargs['body'].read()
            self.was_file = hasattr(kwargs['body'], 'fileno')
        return self.response
    def clear(self): self.cleared = True


class StorageTests(unittest.TestCase):
    def storage(self, response, **kwargs):
        client = Client(response)
        return PrivateSupabaseStorage('https://jjsetogmnumoudrovpzn.supabase.co', 'scraper-raw', 'fixture-private-key', client=client, **kwargs), client

    def test_secret_destination_is_owned_fixed_and_no_redirects(self):
        for origin in ['https://evil.example', 'http://jjsetogmnumoudrovpzn.supabase.co', 'https://jjsetogmnumoudrovpzn.supabase.co/path', 'https://user:secret@jjsetogmnumoudrovpzn.supabase.co']:
            with self.assertRaises(ValueError):
                PrivateSupabaseStorage(origin, 'scraper-raw', 'fixture')
        storage, _ = self.storage(Response(b''))
        for key in ['../private', 'source/../../secret', 'https://evil.example/a', '/absolute']:
            with self.assertRaises(ValueError): storage._url(key)

    def test_upload_streams_file_and_closes_acknowledgement(self):
        response = Response(b'{}')
        storage, client = self.storage(response)
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'artifact'; path.write_bytes(b'%PDF fixture')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            storage.upload('fixture/2026/' + digest + '.pdf', Artifact(path, 'https://fixture.example/a.pdf', 'application/pdf', path.stat().st_size, digest))
        self.assertTrue(client.was_file)
        self.assertEqual(client.uploaded, b'%PDF fixture')
        self.assertFalse(client.calls[0][2]['redirect'])
        self.assertFalse(client.calls[0][2]['retries'])
        self.assertTrue(response.closed and response.released)
        storage.close(); self.assertTrue(client.cleared)

    def test_materialized_content_is_verified_and_tempfile_removed(self):
        data = b'%PDF fixture' * 10000
        digest = hashlib.sha256(data).hexdigest()
        response = Response(data)
        storage, _ = self.storage(response)
        with storage.materialize('fixture/2026/' + digest + '.pdf', source_url='https://fixture.example/a.pdf') as artifact:
            path = artifact.path
            self.assertEqual(artifact.sha256, digest)
            self.assertEqual(artifact.size, len(data))
            self.assertTrue(path.exists())
        self.assertFalse(path.exists())
        self.assertTrue(response.closed and response.released)
        self.assertTrue(all(size == 65536 for size in response.chunks))

    def test_bad_hash_length_limit_and_redirect_are_not_materialized(self):
        for response, limit in [(Response(b'bad'), 10), (Response(b'bad', headers={'Content-Length': '4'}), 10), (Response(b'oversize'), 2), (Response(b'bad', status=302), 10)]:
            storage, _ = self.storage(response, max_bytes=limit)
            with self.assertRaises(ValueError):
                with storage.materialize('fixture/2026/' + 'a' * 64 + '.pdf'):
                    self.fail('Unverified bytes yielded')
            self.assertTrue(response.closed and response.released)

    def test_raw_driver_keeps_private_r2_primary_and_legacy_reader(self):
        class R2:
            def upload(self, key, artifact): self.key = key; return 'r2://continua-financial-documents/' + key
            def key_from_location(self, location): return location.split('/', 3)[-1]
            def materialize(self, key, **kwargs): return ('r2', key)
        class Rollback:
            def materialize(self, key, **kwargs): return ('rollback', key)
        r2 = R2(); driver = RawStorage(r2, Rollback())
        artifact = Artifact(pathlib.Path('fixture'), 'https://fixture.example/a', 'application/pdf; charset=binary', 10, 'a' * 64)
        location = driver.store('fixture', artifact)
        self.assertTrue(location.startswith('r2://continua-financial-documents/fixture/'))
        self.assertTrue(location.endswith('.pdf'))
        self.assertEqual(driver.materialize(location)[0], 'r2')
        self.assertEqual(driver.materialize('fixture/2025/original.pdf'), ('rollback', 'fixture/2025/original.pdf'))
        with self.assertRaises(ValueError): driver.store('../private', artifact)
