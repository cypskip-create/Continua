"""Bounded native schedules, source singleflight, reader catch-up and shutdown."""
import asyncio
import json
import pathlib
import time
from datetime import datetime,timezone
from .diagnostics import timestamp
from .serial import SerialWorkQueue

class CollectorScheduler:
    def __init__(self,sources,registry,extraction,archive,*,enabled=False,news_cron='*/10 * * * *',default_cron='0 */6 * * *',drain_cron='*/2 * * * *',drain_batch=10,sweep_cron='*/15 * * * *',sweep_batch=50,archive_cron='*/15 * * * *',archive_batch=5):
        self.sources,self.registry,self.extraction,self.archive=sources,registry,extraction,archive
        self.enabled,self.news_cron,self.default_cron=enabled,news_cron,default_cron
        self.drain_cron,self.drain_batch,self.sweep_cron,self.sweep_batch=drain_cron,drain_batch,sweep_cron,sweep_batch
        if type(archive_batch) is not int or not 1<=archive_batch<=20:raise ValueError('Invalid archive transfer batch')
        self.archive_cron,self.archive_batch=archive_cron,archive_batch
        self.queue=SerialWorkQueue(50);self.running=set();self.news_runs={};self.tasks=set();self.refreshes={};self.last_refresh={}
        self.schedule=[];self.loop_task=None;self.closed=False;self.periodic_running=set()

    def spawn(self,work):
        if self.closed or len(self.tasks)>=50:
            work.close()
            raise RuntimeError('Collector scheduler closed or at capacity')
        task=asyncio.create_task(work);self.tasks.add(task)
        def finished(t):
            self.tasks.discard(t)
            if not t.cancelled():t.exception() # Observe errors without exposing private details.
        task.add_done_callback(finished);return task

    async def source_once(self,source,drain=False):
        if source['id'] in self.running:return
        self.running.add(source['id'])
        async def work():
            if source['adapter']=='rss':self.news_runs[source['id']]={'startedAt':timestamp(),'completedAt':None,'success':None}
            try:
                summary=await self.registry.run(source['id'],drain_only=drain,batch_size=self.drain_batch if source['adapter'] in ('nse','kenyanstocks','afx') else None)
                if source['adapter']=='rss':self.news_runs[source['id']].update(completedAt=timestamp(),success=summary['failed']==0 and summary['discovered']>0,discovered=summary['discovered'],extracted=summary['extracted'])
                return summary
            except Exception:
                if source['adapter']=='rss':self.news_runs[source['id']].update(completedAt=timestamp(),success=False)
                return None
        try:return await self.queue.run(work)
        finally:self.running.discard(source['id'])

    def status(self):
        return {'enabled':self.enabled,'cron':self.news_cron,'running':[id for id in self.running if id in self.news_runs],
            'sources':[dict(sourceId=id,**state) for id,state in self.news_runs.items()]}

    async def refresh(self,kind):
        if kind not in ('news','indices','documents'):raise ValueError('Invalid collector refresh')
        active=self.refreshes.get(kind)
        if active is not None and not active.done():return await asyncio.shield(active)
        now=time.monotonic();cooldown=900 if kind=='indices' else 600
        if not self.enabled or now-self.last_refresh.get(kind,-cooldown)<cooldown:return
        self.last_refresh[kind]=now
        async def run():
            if kind=='news':
                for source in await self.sources.enabled():
                    if source['adapter']=='rss':await self.source_once(source)
            else:
                source=await self.sources.get('nse-index-summary' if kind=='indices' else 'kenyanstocks')
                if source and source['enabled'] and (kind!='documents' or source.get('redistributionAllowed') is True):await self.source_once(source,kind=='documents')
        task=self.spawn(run());self.refreshes[kind]=task;return await asyncio.shield(task)

    async def _drain(self):
        for source in await self.sources.enabled():
            if source['adapter'] in ('nse','kenyanstocks','afx'):await self.source_once(source,True)

    async def _initial(self,sources):
        await self.queue.run(lambda:self.archive.run(self.archive_batch))
        priority=lambda s:2 if s['id']=='nse-index-summary' else 1 if s['adapter']=='rss' else 0
        for source in sorted(sources,key=priority,reverse=True):await self.source_once(source)
        await self.queue.run(lambda:self.extraction.sweep(self.sweep_batch))

    async def start(self):
        if not self.enabled:return
        if self.loop_task is not None:raise RuntimeError('Collector scheduler already started')
        from croniter import croniter
        catalogue=json.loads(pathlib.Path(__file__).with_name('default_sources.json').read_text(encoding='utf-8'))
        for source in catalogue:await self.sources.save(source,only_if_missing=True)
        sources=await self.sources.enabled()
        for source in sources:
            expression=self.news_cron if source['adapter']=='rss' else source['config'].get('schedule') or self.default_cron
            if croniter.is_valid(expression,second_at_beginning=len(expression.split())==6):self.schedule.append((expression,lambda source=source:self.source_once(source)))
        for expression,work in [(self.archive_cron,lambda:self.queue.run(lambda:self.archive.run(self.archive_batch))),(self.drain_cron,self._drain),(self.sweep_cron,lambda:self.queue.run(lambda:self.extraction.sweep(self.sweep_batch)))]:
            if croniter.is_valid(expression,second_at_beginning=len(expression.split())==6):self.schedule.append((expression,work))
        self.spawn(self._initial(sources));self.loop_task=asyncio.create_task(self._loop())

    async def _loop(self):
        from croniter import croniter
        seen={}
        while not self.closed:
            now=datetime.now(timezone.utc)
            for i,(expression,work) in enumerate(self.schedule):
                seconds=len(expression.split())==6;stamp=now.replace(microsecond=0) if seconds else now.replace(second=0,microsecond=0)
                if seen.get(i)==stamp:continue
                seen[i]=stamp
                if croniter.match(expression,stamp,day_or=False,second_at_beginning=seconds):
                    if i in self.periodic_running:continue
                    async def singleflight(i=i,work=work):
                        try:await work()
                        finally:self.periodic_running.discard(i)
                    self.periodic_running.add(i)
                    try:self.spawn(singleflight())
                    except RuntimeError:self.periodic_running.discard(i)
            await asyncio.sleep(1)

    async def close(self,grace_seconds=10):
        if not isinstance(grace_seconds,(int,float)) or isinstance(grace_seconds,bool) or not 0<=grace_seconds<=30:
            raise ValueError('Invalid scheduler shutdown grace')
        self.closed=True
        if self.loop_task:
            self.loop_task.cancel();await asyncio.gather(self.loop_task,return_exceptions=True)
        if self.tasks:
            # Do not finish an entire multi-source startup crawl during Render
            # shutdown. Finish bounded active work or cancel its owned process;
            # durable jobs keep their attempt lease for restart recovery.
            _,pending=await asyncio.wait(list(self.tasks),timeout=grace_seconds)
            for task in pending:task.cancel()
            if pending:await asyncio.gather(*pending,return_exceptions=True)
        await self.queue.close()
