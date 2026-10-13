"""Source permission/configuration records; preserve operator disables on boot."""
from .documents import encode
from .artifacts import mapped

FIELDS={"id":"id","name":"name","adapter":"adapter","enabled":"enabled","config":"config","terms_url":"termsUrl",
    "robots_url":"robotsUrl","license":"license","allowed_usage":"allowedUsage","redistribution_allowed":"redistributionAllowed",
    "attribution_required":"attributionRequired","created_at":"createdAt","updated_at":"updatedAt"}

class Sources:
    def __init__(self,database):
        self.database=database

    async def enabled(self):
        rows=await self.database.query("SELECT * FROM scraping.sources WHERE enabled=true ORDER BY id")
        return [mapped(row,FIELDS) for row in rows]

    async def get(self,source_id):
        rows=await self.database.query("SELECT * FROM scraping.sources WHERE id=%s",(source_id,))
        return mapped(rows[0],FIELDS) if rows else None

    async def save(self,source,*,only_if_missing=False):
        sql="""INSERT INTO scraping.sources
          (id,name,adapter,enabled,config,terms_url,robots_url,license,allowed_usage,redistribution_allowed,attribution_required)
          VALUES(%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s)"""
        if only_if_missing:
            sql+=" ON CONFLICT(id) DO NOTHING"
        else:
            sql+=""" ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,adapter=EXCLUDED.adapter,enabled=EXCLUDED.enabled,
              config=EXCLUDED.config,terms_url=EXCLUDED.terms_url,robots_url=EXCLUDED.robots_url,license=EXCLUDED.license,
              allowed_usage=EXCLUDED.allowed_usage,redistribution_allowed=EXCLUDED.redistribution_allowed,
              attribution_required=EXCLUDED.attribution_required,updated_at=now()"""
        await self.database.query(sql,(source["id"],source["name"],source["adapter"],source["enabled"],encode(source["config"]),
            source.get("termsUrl"),source.get("robotsUrl"),source.get("license"),source.get("allowedUsage"),
            source["redistributionAllowed"],source["attributionRequired"]))
