"""Publisher year/page checkpoints; completion follows durable enqueue only."""
class ArchiveCheckpoints:
    def __init__(self,database):self.database=database

    async def get(self,source,url,year):
        rows=await self.database.query("""INSERT INTO scraping.archive_checkpoints(source_id,archive_url,archive_year)
          VALUES(%s,%s,%s) ON CONFLICT(source_id,archive_url,archive_year) DO UPDATE SET
          pages=CASE WHEN archive_checkpoints.refreshed_at<now()-interval '7 days' THEN '{1}'::integer[] ELSE archive_checkpoints.pages END,
          completed_pages=CASE WHEN archive_checkpoints.refreshed_at<now()-interval '7 days' THEN '{}'::integer[] ELSE archive_checkpoints.completed_pages END,
          refreshed_at=CASE WHEN archive_checkpoints.refreshed_at<now()-interval '7 days' THEN now() ELSE archive_checkpoints.refreshed_at END
          RETURNING pages,completed_pages""",(source,url,year))
        if not rows:raise RuntimeError('Publisher archive checkpoint unavailable')
        return rows[0]

    async def complete(self,source,url,year,page,pages):
        if type(page) is not int or not 1<=page<=500 or any(type(p) is not int or not 1<=p<=500 for p in pages):raise ValueError('Invalid publisher page')
        await self.database.query("""UPDATE scraping.archive_checkpoints SET
          pages=ARRAY(SELECT DISTINCT p FROM unnest(pages||%s::integer[]) p ORDER BY p),
          completed_pages=ARRAY(SELECT DISTINCT p FROM unnest(completed_pages||%s::integer) p ORDER BY p),updated_at=now()
          WHERE source_id=%s AND archive_url=%s AND archive_year=%s""",(pages,page,source,url,year))
