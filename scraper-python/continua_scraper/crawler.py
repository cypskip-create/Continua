"""Generic source-scoped native crawl; storage completes before lease commit."""
import asyncio
from .html import extract_from_html,canonicalize_url,matches_discovery_paths

class GenericCrawler:
    def __init__(self,io,state,dead_letters):self.io,self.state,self.dead_letters=io,state,dead_letters;self.id=io.source['id']

    async def run(self,batch_size=20):
        source=self.io.source;config=source.get('config') or {}
        if not source.get('enabled'):raise ValueError('Source is disabled')
        if config.get('requiresCommercialPermission') is True and not str(config.get('permissionReference') or '').strip():raise PermissionError('Source requires a written commercial permission reference')
        maximum=config.get('maxDepth',3)
        if type(maximum) is not int or not 0<=maximum<=6:raise ValueError('Invalid crawl depth')
        for seed in config.get('seeds',[]):
            self.io.downloader.policy.check_url(seed)
            await self.state.discovered(self.id,seed,0,canonicalize_url(seed),revisit_minutes=config.get('revisitAfterMinutes') or 1440)
        batch=await self.state.claim(self.id,batch_size)
        summary={'sourceId':self.id,'visited':0,'discovered':0,'stored':0,'failed':0}
        for item in batch:
            summary['visited']+=1;fetched=None
            await self.state.crawling(item['id'],item['lastSeen'])
            try:
                if not await self.io.downloader.robots_allowed(item['url']):
                    await self.state.failed(item['id'],item['lastSeen'],'disallowed_by_robots_txt');summary['failed']+=1;continue
                document={'url':item['url'],'discoveredFrom':item.get('parentUrl'),'title':config.get('issuerName')}
                fetched=await self.io.fetch_document(document,source['adapter'],'scraper-phase6-0.1.0')
                if fetched['isNewArtifact']:summary['stored']+=1
                if 'text/html' in (fetched.get('contentType') or '') and item['depth']<maximum:
                    for link in extract_from_html(self.io.text(fetched['artifact']),fetched['artifact'].url)['links']:
                        try:self.io.downloader.policy.check_url(link['url'])
                        except (ValueError,PermissionError):continue
                        if not matches_discovery_paths(link['url'],config.get('discoveryPaths')):continue
                        await self.state.discovered(self.id,link['url'],item['depth']+1,canonicalize_url(link['url']),fetched['artifact'].url)
                        summary['discovered']+=1
                # A failed archive write must remain recoverable instead of
                # falsely marking a URL complete before its bytes are durable.
                await self.state.crawled(item['id'],item['lastSeen'],200,fetched.get('contentType'),fetched['sha256'],item.get('contentHash')!=fetched['sha256'])
            except Exception as error:
                reason=f'fetch: {type(error).__name__}'
                await self.state.failed(item['id'],item['lastSeen'],reason)
                try:await self.dead_letters.record(self.id,item['url'],'fetch',reason)
                except Exception:pass
                summary['failed']+=1
            finally:
                if fetched:fetched['cleanup']()
        return summary
