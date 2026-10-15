import asyncio
import hashlib
import io
import os
import pathlib
import sys
import tempfile
import unittest
import zlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from continua_scraper.pdf import PdfExtractor
from continua_scraper.serial import SerialWorkQueue
from continua_scraper.process import run_process,child_environment,NativeWorkerError
from continua_scraper.download import DecodedWriter

def fixture_pdf():
    stream=b'BT /F1 12 Tf 50 750 Td (INCOME STATEMENT) Tj 0 -20 Td (Revenue 100 90) Tj 0 -20 Td (Profit 20 18) Tj 0 -20 Td (Actual source evidence for the test annual statement.) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    body=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(body));body+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(body);body+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets:body+=f'{offset:010d} 00000 n \n'.encode()
    return body+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'

class CompressionTests(unittest.TestCase):
    def test_bounded_gzip_and_deflate_and_truncated(self):
        raw=b'source evidence'*10000
        for encoding,wbits in [('gzip',31),('deflate',15)]:
            compressor=zlib.compressobj(wbits=wbits);data=compressor.compress(raw)+compressor.flush();dest=io.BytesIO();writer=DecodedWriter(dest,encoding,len(raw))
            for i in range(0,len(data),17):writer.write(data[i:i+17])
            self.assertEqual(writer.finish(),(len(raw),hashlib.sha256(raw).hexdigest()));self.assertEqual(dest.getvalue(),raw)
            writer=DecodedWriter(io.BytesIO(),encoding,100)
            with self.assertRaises(ValueError):writer.write(data)
            writer=DecodedWriter(io.BytesIO(),encoding,len(raw));writer.write(data[:-8])
            with self.assertRaises(ValueError):writer.finish()

class PdfProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_browser_entrypoint_does_not_shadow_standard_library_html(self):
        entry=pathlib.Path(__file__).resolve().parents[1]/'browser_worker.py'
        result=await run_process([sys.executable,entry,'--check-dependencies'],max_output=1000)
        self.assertEqual(result.strip(),b'native-browser-dependencies-ok')

    async def test_real_native_pdf_file_parser_returns_reviewed_layout(self):
        with tempfile.TemporaryDirectory(prefix='continua-pdf-fixture-') as directory:
            path=pathlib.Path(directory)/'source.pdf';path.write_bytes(fixture_pdf())
            result=await PdfExtractor(SerialWorkQueue(),ocr=False).extract(path)
            self.assertEqual(result['method'],'native_pdf_text');self.assertIn('Revenue',result['text'] or '')
            self.assertTrue(result['needsReview']);self.assertTrue(result['tables']);self.assertTrue(path.exists())

    async def test_subprocess_secrets_output_and_deadline(self):
        os.environ['CONTINUA_FIXTURE_PRIVATE_SECRET']='do-not-forward'
        try:
            result=await run_process([sys.executable,'-c','import os;print("CONTINUA_FIXTURE_PRIVATE_SECRET" in os.environ)'])
            self.assertEqual(result.strip(),b'False');self.assertNotIn('CONTINUA_FIXTURE_PRIVATE_SECRET',child_environment())
            with self.assertRaises(ValueError):await run_process([sys.executable,'-c','print("x"*100000)'],max_output=100)
            with self.assertRaises(NativeWorkerError) as failure:
                await run_process([sys.executable,'-c','import sys;print("private-fixture-diagnostic",file=sys.stderr);sys.exit(7)'])
            self.assertEqual(failure.exception.returncode,7)
            self.assertNotIn('private-fixture',str(failure.exception))
            with self.assertRaises(TimeoutError):await run_process([sys.executable,'-c','import time;time.sleep(10)'],timeout=.1)
        finally:os.environ.pop('CONTINUA_FIXTURE_PRIVATE_SECRET',None)

if __name__=='__main__':unittest.main()
