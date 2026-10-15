"""Native file-backed PDF/OCR extraction. All heavy parsers share one queue."""
import csv
import io
import json
import pathlib
import sys
import tempfile
from .process import run_process
from .tables import text_tables

class PdfExtractor:
    parser_version='pdfplumber-layout-text-0.1.0'
    def __init__(self,queue,*,native='python',python=None,ocr=True):
        if native not in ('python','poppler'):raise ValueError('Invalid native PDF parser')
        self.queue,self.native,self.python,self.ocr=queue,native,python or sys.executable,ocr
        if native=='poppler':self.parser_version='poppler-layout-text-0.4.0'

    async def extract(self,path):
        path=pathlib.Path(path)
        if path.stat().st_size>50*1024*1024:raise ValueError('PDF input exceeds limit')
        with path.open('rb') as file:
            if file.read(5)!=b'%PDF-':raise ValueError('Invalid PDF evidence')
        return await self.queue.run(lambda:self._extract(path))

    async def _native(self,path):
        empty={'parserVersion':self.parser_version,'method':'native_pdf_text','confidence':0,'text':None,'tables':[],'needsReview':True}
        try:
            table_text=None;truncated=False
            if self.native=='python':
                # Retain the already-native, resource-limited Python worker.
                worker=pathlib.Path(__file__).resolve().parents[2]/'scraper'/'python'/'pdf_extract.py'
                raw=await run_process([self.python,worker.resolve(),path])
                parsed=json.loads(raw)
                if set(parsed)!={'text','tableText','pageCount','truncated','parserVersion'} or not isinstance(parsed['text'],str) or not isinstance(parsed['tableText'],str) or type(parsed['pageCount']) is not int or not 0<=parsed['pageCount']<=500 or type(parsed['truncated']) is not bool or parsed['parserVersion']!='pdfplumber-0.11.9-layout-v1':raise ValueError('Invalid native PDF response')
                text=parsed['text'].strip();table_text=parsed['tableText'];page_count=parsed['pageCount'];truncated=parsed['truncated']
            else:
                raw=await run_process(['pdftotext','-layout','-enc','UTF-8','-l','500',path,'-'])
                text=raw.decode('utf-8',errors='replace').strip();page_count=max(1,len(raw.decode('utf-8',errors='replace').split('\f'))-1)
            usable=len(text)>=50
            average=len(text)/page_count if page_count else len(text)
            return {'parserVersion':self.parser_version,'method':'native_pdf_text','confidence':min(.95,.5+average/4000) if usable else .1,
                'text':text or None,'tables':text_tables(table_text if table_text is not None else text) if usable else [],
                'needsReview':self.native=='python' or not usable or truncated or page_count>=500}
        except Exception:return empty

    async def _ocr(self,path):
        empty={'parserVersion':'ocr-tesseract-native-0.1.0','method':'ocr','confidence':0,'text':None,'tables':[],'needsReview':True}
        try:
            chunks=[];confidences=[];used=0
            with tempfile.TemporaryDirectory(prefix='continua-native-ocr-') as directory:
                directory=pathlib.Path(directory)
                # One raster page at a time, not 15 full-resolution resident images.
                info=(await run_process(['pdfinfo',path],max_output=65536)).decode('utf-8',errors='replace')
                import re
                match=re.search(r'^Pages:\s+(\d+)',info,re.M)
                if not match:raise ValueError('PDF page count unavailable')
                for number in range(1,min(int(match[1]),15)+1):
                    prefix=directory/'page'
                    await run_process(['pdftoppm','-png','-r','200','-f',str(number),'-l',str(number),'-singlefile',path,prefix],max_output=65536)
                    image=prefix.with_suffix('.png')
                    try:
                        if not image.exists() or image.stat().st_size>50*1024*1024:raise ValueError('OCR image exceeds limit')
                        tsv=(await run_process(['tesseract',image,'stdout','-l','eng','tsv'],timeout=60,max_output=8*1024*1024)).decode('utf-8',errors='replace')
                        lines={}
                        for row in csv.DictReader(io.StringIO(tsv),delimiter='\t'):
                            text=(row.get('text') or '').strip()
                            if not text:continue
                            key=tuple(row.get(k) for k in ('page_num','block_num','par_num','line_num'))
                            lines.setdefault(key,[]).append(text)
                            try:
                                confidence=float(row.get('conf','-1'))
                                if 0<=confidence<=100:confidences.append(confidence)
                            except ValueError:pass
                        text='\n'.join(' '.join(words) for words in lines.values())
                        used+=len(text.encode('utf-8'))
                        if used>8*1024*1024:raise ValueError('OCR output exceeds limit')
                        chunks.append(text)
                    finally:image.unlink(missing_ok=True)
            text='\n\n-- page break --\n\n'.join(chunks).strip()
            return dict(empty,text=text or None,confidence=min(.85,sum(confidences)/len(confidences)/100) if confidences else 0)
        except Exception:return empty

    async def _extract(self,path):
        native=await self._native(path)
        if not self.ocr or (native.get('text') and len(native['text'])>=50):return native
        ocr=await self._ocr(path)
        return ocr if ocr.get('text') and len(ocr['text'])>len(native.get('text') or '') else native
