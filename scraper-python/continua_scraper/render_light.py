"""Native free-instance guard: one small official index page, never bulk work."""
import asyncio
import json
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from .scheduler import CollectorScheduler

SOURCE = 'nse-index-summary'
MAX_BYTES = 512*1024
scope = ContextVar('continua_light_requests', default=None)


def route_allowed(method, path):
    return method == 'GET' and path in ('/health', '/health/live', '/news/status', '/sources', '/crawl-status') or method == 'POST' and path == '/indices/refresh'


def slot_id(now=None):
    now = now or datetime.now(timezone.utc)
    return f'render-index-{int(now.timestamp() // 21600)}'


@contextmanager
def request_scope():
    token = scope.set({'requests': 0})
    try:
        yield
    finally:
        scope.reset(token)


def reserve_request():
    state = scope.get()
    if state is None or state['requests'] >= 4:
        raise ValueError('Light collection request budget reached')
    state['requests'] += 1


CLAIM = """INSERT INTO scraping.scheduled_runs(id,kind,status,receipt)
 VALUES(%s,'drain','running','{"attempt":1}'::jsonb)
 ON CONFLICT(id) DO UPDATE SET status='running',started_at=now(),completed_at=NULL,
 receipt=jsonb_set(scraping.scheduled_runs.receipt,'{attempt}',
 to_jsonb(COALESCE((scraping.scheduled_runs.receipt->>'attempt')::int,1)+1))
 WHERE scraping.scheduled_runs.status='failed'
 AND COALESCE((scraping.scheduled_runs.receipt->>'attempt')::int,1)<2
 AND scraping.scheduled_runs.completed_at<now()-interval '20 minutes'
 RETURNING id,receipt->>'attempt' AS attempt"""


class RenderLightScheduler(CollectorScheduler):
    def status(self):
        return {'enabled': False, 'owner': 'github-actions', 'running': [], 'sources': []}

    async def refresh(self, kind):
        if kind != 'indices':
            raise ValueError('Bulk collection belongs to the finite collector')
        return await super().refresh(kind)

    async def source_once(self, source, drain=False):
        if not self.enabled or source['id'] != SOURCE or source['adapter'] != 'web' or not source['enabled'] or drain or SOURCE in self.running:
            return
        self.running.add(SOURCE)
        try:
            identity = slot_id()
            claims = await self.registry.database.query(CLAIM, (identity,))
            if not claims:
                return
            result, status = {}, 'failed'
            try:
                async with asyncio.timeout(75):
                    with request_scope():
                        result = await self.registry.run(SOURCE, batch_size=1)
                if result.get('failed') == 0:
                    status = 'completed'
                return result
            finally:
                receipt = dict(result, role='render-light', sourceId=SOURCE, attempt=int(claims[0]['attempt']))
                await self.registry.database.query("UPDATE scraping.scheduled_runs SET status=%s,completed_at=now(),receipt=%s::jsonb WHERE id=%s",
                                                   (status, json.dumps(receipt, allow_nan=False), identity))
        finally:
            self.running.discard(SOURCE)

    async def start(self):
        if not self.enabled:
            return
        if self.loop_task is not None:
            raise RuntimeError('Collector scheduler already started')
        source = await self.sources.get(SOURCE)
        if source is None or not source['enabled'] or source['adapter'] != 'web':
            return
        # No archive, sweep, news, PDF, browser or document startup job.
        self.schedule = [('0 */6 * * *', lambda: self.source_once(source))]
        self.spawn(self.source_once(source))
        self.loop_task = asyncio.create_task(self._loop())
