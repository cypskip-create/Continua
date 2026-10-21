"""Bounded literal CSV/XLSX evidence. Formula evaluation and fiscal guesses forbidden."""
import csv
import re
import zipfile
import xml.etree.ElementTree as ET

NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def table(rows,title,source_rows=None):
    if len(rows)>10000 or any(len(row)>100 for row in rows):raise ValueError('Spreadsheet row/column budget exceeded')
    if not rows:return None
    if any(len(str(value))>8192 for row in rows for value in row if value is not None):raise ValueError('Spreadsheet cell budget exceeded')
    return dict(title=title,headerLine=' | '.join(str(c or '') for c in rows[0]),
                rows=[dict(label=str(row[0] or ''),values=row[1:],sourceRow=source_rows[index+1] if source_rows else index+2) for index,row in enumerate(rows[1:]) if row],
                method='literal-tabular-v1')


def xml(body):
    if b'<!DOCTYPE' in body or b'<!ENTITY' in body:raise ValueError('Spreadsheet XML declarations are unsupported')
    return ET.fromstring(body)


def parse_tabular(path,content_type):
    if path.stat().st_size>8*1024*1024:raise ValueError('Structured source exceeds 8 MiB parser budget')
    tables=[]
    if 'csv' in content_type:
        with path.open(encoding='utf-8-sig',newline='') as source:
            rows=[]
            for row in csv.reader(source):
                rows.append(row)
                if len(rows)>10000:raise ValueError('CSV row budget exceeded')
        extracted=table(rows,'CSV source table')
        if extracted:tables.append(extracted)
        method='structured_csv'
    else:
        with zipfile.ZipFile(path) as workbook:
            members=workbook.infolist()
            if len(members)>5000 or len({m.filename for m in members})!=len(members) or sum(m.file_size for m in members)>32*1024*1024 or any(m.file_size>8*1024*1024 for m in members):
                raise ValueError('Spreadsheet expanded archive budget exceeded')
            shared=[]
            if 'xl/sharedStrings.xml' in workbook.namelist():
                shared=[''.join(item.itertext()) for item in xml(workbook.read('xl/sharedStrings.xml')).findall('s:si',NS)]
            sheets=sorted(name for name in workbook.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',name))
            if len(sheets)>20:raise ValueError('Spreadsheet sheet budget exceeded')
            for sheet in sheets:
                rows=[];source_rows=[]
                for row in xml(workbook.read(sheet)).findall('.//s:sheetData/s:row',NS):
                    values=[]
                    for cell in row.findall('s:c',NS):
                        address=cell.get('r','');match=re.fullmatch(r'([A-Z]+)\d+',address)
                        if not match:raise ValueError('Spreadsheet cell address missing')
                        index=0
                        for char in match[1]:index=index*26+ord(char)-64
                        if index>100:raise ValueError('Spreadsheet column budget exceeded')
                        while len(values)<index:values.append(None)
                        value=cell.findtext('s:v',None,NS)
                        if cell.find('s:f',NS) is not None:value=None # cached formula values are not authenticated observations
                        elif cell.get('t')=='s':
                            if value is None or not value.isdigit() or int(value)>=len(shared):raise ValueError('Invalid shared string index')
                            value=shared[int(value)]
                        elif cell.get('t')=='inlineStr':
                            inline=cell.find('s:is',NS);value=''.join(inline.itertext()) if inline is not None else None
                        elif cell.get('t')=='b':value='TRUE' if value=='1' else 'FALSE'
                        values[index-1]=value
                    rows.append(values);source_rows.append(int(row.get('r',len(rows))))
                    if len(rows)>10000:raise ValueError('Spreadsheet row budget exceeded')
                extracted=table(rows,sheet,source_rows)
                if extracted:tables.append(extracted)
        method='structured_xlsx'
    return dict(method=method,parserVersion='literal-tabular-v1',confidence=None,text='Literal structured source; units, fiscal columns and consolidation require review.',
                tables=tables,entity={},needsReview=True)
