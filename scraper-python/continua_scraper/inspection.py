"""Bounded read-only document inspection for explicit private operators."""
import json


async def extraction(database,identifier,include_text=False):
    if type(identifier) is not int or not 1<=identifier<=9007199254740991:
        raise ValueError('Explicit extraction identifier required')
    # The text is selected only when explicitly requested and bounded in SQL,
    # avoiding accidental multi-megabyte transfers for an inventory operation.
    rows=await database.query("""SELECT e.id,a.source_id,a.document_url,e.method,e.needs_review,
      length(e.text) AS characters,
      CASE WHEN %s AND octet_length(e.text)<=8388608 THEN e.text ELSE NULL END AS text,
      CASE WHEN %s AND octet_length(e.text)>8388608 THEN true ELSE false END AS text_exceeds_budget
      FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE e.id=%s""",
      (include_text,include_text,identifier))
    if not rows:raise ValueError('Extraction not found')
    if rows[0]['text_exceeds_budget']:raise ValueError('Extraction text exceeds operator response budget')
    validations=await database.query("""SELECT outcome,reason,validator_version,validated_at FROM market.document_validations
      WHERE extraction_id=%s ORDER BY validated_at DESC LIMIT 1""",(identifier,))
    result={'report':rows[0],'validation':validations,'readOnly':True}
    if len(json.dumps(result,default=str).encode())>9*1024*1024:
        raise ValueError('Document inspection response exceeds budget')
    return result


async def archive_layouts(database,source_id):
    outcomes=await database.query("""WITH latest AS (
      SELECT DISTINCT ON(v.extraction_id) v.outcome,v.reason FROM market.document_validations v
      JOIN scraping.extractions e ON e.id=v.extraction_id JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
      WHERE a.source_id=%s ORDER BY v.extraction_id,v.validated_at DESC)
      SELECT outcome,reason,count(*) AS count FROM latest GROUP BY outcome,reason ORDER BY count(*) DESC LIMIT 20""",(source_id,))
    reports=await database.query("""SELECT e.id,e.method,a.title,a.document_url,length(e.text) AS characters,
      substring(e.text,1,300) AS masthead FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
      WHERE a.source_id=%s AND e.method='native_pdf_text' ORDER BY e.id DESC LIMIT 16""",(source_id,))
    return {'outcomes':outcomes,'reports':reports,'readOnly':True}
