"""Literal relationship tables; private review drafts, never inferred networks."""
import hashlib
import json
import math
import re
from datetime import date

VERSION='exposure-literal-v1'
TYPES={'owns','subsidiary-of','currency-exposure','commodity-exposure','lends-to','borrows-from','related-party','sector'}

def relationship_tables(tables):
    drafts=[]
    for table_index,table in enumerate(tables):
        header=table.get('headerLine')
        if not isinstance(header,str):continue
        headers=[cell.strip().lower() for cell in header.split('|')]
        required=['from entity','from type','to entity','to type','relationship','effective date']
        if not all(key in headers for key in required):continue
        if len(headers)!=len(set(headers)):continue
        rows=[]
        for index,row in enumerate(table.get('rows',[])[:500]):
            raw=[row.get('label')]+list(row.get('values',[]));cells=dict(zip(headers,raw))
            kind=str(cells.get('relationship','')).strip().lower()
            try:effective=str(cells['effective date']).strip();parsed=date.fromisoformat(effective)
            
            except(ValueError,KeyError,TypeError):continue
            if parsed.isoformat()!=effective:continue
            allowed_types={'company','security','sector','shareholder','subsidiary','financial-institution','factor','currency','commodity','event','related-company'}
            if cells.get('from type') not in allowed_types or cells.get('to type') not in allowed_types:continue
            if kind not in TYPES or not all(isinstance(cells.get(key),str) and 1<=len(cells[key].strip())<=200 for key in required[:4]):continue
            normalized={key:cells[key].strip() for key in required[:4]}
            # Explicit entity identifiers, not name similarity, determine connectivity.
            if ':' not in normalized['from entity'] or ':' not in normalized['to entity']:continue
            percent=cells.get('ownership percent');amount=cells.get('exposure amount')
            def literal(value):
                if value is None or str(value).strip() in ('','—','-'):return None
                clean=str(value).strip()
                if not re.fullmatch(r'-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?',clean):raise ValueError('Nonliteral number')
                value=float(clean.replace(',',''))
                if not math.isfinite(value):raise ValueError('Nonfinite')
                return value
            try:percent=literal(percent);amount=literal(amount)
            except ValueError:continue
            if percent is not None and not 0<=percent<=100:continue
            currency=str(cells.get('currency') or '').strip() or None
            if amount is not None and not currency:continue
            rows.append(dict(fromEntity=normalized['from entity'],fromType=normalized['from type'],toEntity=normalized['to entity'],toType=normalized['to type'],type=kind,effectiveDate=effective,
                ownershipPercent=percent,amount=amount,currency=currency,sourceCell=dict(table=table_index,row=row.get('sourceRow',index+2),columns={key:headers.index(key) for key in required+['ownership percent','exposure amount','currency'] if key in headers},raw={key:str(cells[key])[:2000] for key in required+['ownership percent','exposure amount','currency'] if key in cells},excerptTruncated=any(len(str(cells.get(key,'')))>2000 for key in required+['ownership percent','exposure amount','currency'])),verification='pending'))
        if rows:drafts.append(dict(kind='exposure_relationship_drafts',parserVersion=VERSION,relationships=rows))
    return drafts


async def store_relationship_drafts(database,limit=10):
    if type(limit) is not int or not 1<=limit<=25:raise ValueError('Invalid relationship batch')
    rows=await database.query("""SELECT e.id,e.tables,a.id AS artifact_id,a.retrieved_at
     FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
     WHERE a.storage_path LIKE 'r2://continua-financial-documents/%%' AND a.sha256 ~ '^[a-f0-9]{64}$'
       AND jsonb_typeof(e.tables)='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.tables) t WHERE t->>'kind'='exposure_relationship_drafts')
       AND NOT EXISTS(SELECT 1 FROM market.exposure_relationships r WHERE r.artifact_id=a.id AND r.parser_version=%s)
     ORDER BY e.id LIMIT %s""",(VERSION,limit))
    count=0
    for row in rows:
        async with database.transaction() as transaction:
            for table in row['tables']:
                if table.get('kind')!='exposure_relationship_drafts':continue
                for value in table['relationships'][:500]:
                    identity=hashlib.sha256(json.dumps([row['artifact_id'],value,VERSION],sort_keys=True,separators=(',',':')).encode()).hexdigest()
                    inserted=await transaction.query("""INSERT INTO market.exposure_relationships(id,from_entity,to_entity,from_type,to_type,relation_type,effective_date,available_date,ownership_percent,exposure_amount,currency,artifact_id,parser_version,source_cell)
                     VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT DO NOTHING RETURNING id""",
                     (identity,value['fromEntity'],value['toEntity'],value['fromType'],value['toType'],value['type'],value['effectiveDate'],row['retrieved_at'].date().isoformat(),value.get('ownershipPercent'),value.get('amount'),value.get('currency'),row['artifact_id'],VERSION,json.dumps(value['sourceCell'])))
                    count+=len(inserted)
    return dict(extractions=len(rows),pendingRelationships=count,verifiedAutomatically=0)
