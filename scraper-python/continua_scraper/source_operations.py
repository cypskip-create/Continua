"""Explicit operator policy changes; never grants undocumented source rights."""
import json
from datetime import datetime,timezone


async def enable_licensed_nse(database,reference,scope_confirmed):
    if scope_confirmed is not True or not isinstance(reference,str) or not 1<=len(reference.strip())<=200:
        raise ValueError('Explicit NSE permission reference and confirmed scope required')
    audit={'permissionReference':reference,'permissionConfirmedAt':datetime.now(timezone.utc).isoformat(),
           'permissionEvidence':'operator_attestation',
           'permissionScope':['historical_prices','indices','bonds','derivatives','automated_downloads','paid_app_display']}
    async with database.transaction() as transaction:
        rows=await transaction.query("SELECT id FROM scraping.sources WHERE id IN ('nse-index-summary','nse-market-reports') ORDER BY id FOR UPDATE")
        if {row['id'] for row in rows}!={'nse-index-summary','nse-market-reports'}:
            raise ValueError('Both registered NSE collectors are required')
        await transaction.query("""UPDATE scraping.sources SET enabled=true,config=config || %s::jsonb,
          license=%s,updated_at=now() WHERE id IN ('nse-index-summary','nse-market-reports')""",
          (json.dumps(audit),'Written NSE approval reported by operator; retain original approval separately'))
    return {'enabledSources':['nse-index-summary','nse-market-reports'],'permissionRecorded':True,'mappingApprovalChanged':False}


async def record_permission(database,source_id,reference,allowed_usage):
    if not isinstance(reference,str) or not 1<=len(reference.strip())<=200:
        raise ValueError('Recorded operator permission reference required')
    if not isinstance(allowed_usage,str) or not 1<=len(allowed_usage.strip())<=2000:
        raise ValueError('Explicit allowed usage required')
    async with database.transaction() as transaction:
        rows=await transaction.query("SELECT id FROM scraping.sources WHERE id=%s FOR UPDATE",(source_id,))
        if len(rows)!=1:raise ValueError('Exact existing source required')
        await transaction.query("""UPDATE scraping.sources SET redistribution_allowed=true,
          allowed_usage=%s,config=config || %s::jsonb,updated_at=now() WHERE id=%s""",
          (allowed_usage,json.dumps({'permissionReference':reference,'permissionBasis':'user_assertion'}),source_id))
        # Permission does not implicitly enable a source, approve its mapping,
        # bypass robots/rate limits, or alter curated issuer identities.
    return {'sourceId':source_id,'permissionRecorded':True,'collectionEnablementChanged':False,'mappingApprovalChanged':False}


async def disable_news_source(database,source_id):
    async with database.transaction() as transaction:
        rows=await transaction.query("SELECT id FROM scraping.sources WHERE id=%s FOR UPDATE",(source_id,))
        if len(rows)!=1:raise ValueError('Exact existing source required')
        await transaction.query("UPDATE scraping.sources SET enabled=false,updated_at=now() WHERE id=%s",(source_id,))
        # Preserve immutable originals/extractions and reviews for provenance.
        # Only the public news rows are removed by this explicit operation.
        rows=await transaction.query("""WITH removed AS (DELETE FROM market.news_items WHERE source=%s RETURNING 1)
          SELECT count(*) AS removed FROM removed""",(source_id,))
    return {'sourceId':source_id,'disabled':True,'newsRemoved':rows[0]['removed'],'originalEvidencePreserved':True}
