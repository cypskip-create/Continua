"""Native publisher announcements/year archive adapter with resumable pages."""
import re
from .html import official_nse_url,canonical_archive_url,discover_archive_links,archive_documents,archive_form_config,archive_page_numbers

class NseAdapter:
    document_concurrency=1
    persistent_batch_size=25
    parser_version=None
    def __init__(self,io,jobs,checkpoints,pdf):self.io,self.jobs,self.checkpoints,self.pdf=io,jobs,checkpoints,pdf;self.id=io.source['id']

    async def _page(self,url,form=None):
        artifact=await self.io.downloader.fetch(url,form=form)
        try:
            if not official_nse_url(artifact.url):raise ValueError('Publisher redirected outside official archive')
            return artifact.url,self.io.text(artifact)
        finally:artifact.path.unlink(missing_ok=True)

    async def discover(self):
        listing='https://www.nse.co.ke/listed-company-announcements/'
        if not await self.io.downloader.robots_allowed(listing):return []
        final,html=await self._page(listing)
        configured=(self.io.source.get('config') or {}).get('archiveUrls',[])
        configured=[u for u in configured if isinstance(u,str)] if isinstance(configured,list) else []
        urls=list(dict.fromkeys(canonical_archive_url(u) for u in [final,'https://www.nse.co.ke/press-releases/','https://www.nse.co.ke/corporate-actions/','https://www.nse.co.ke/',*discover_archive_links(html,final),*configured] if official_nse_url(u)))
        visited=set();documents={};budget=80
        for url in urls:
            if url in visited:continue
            if len(visited)>=40:break
            visited.add(url)
            if not await self.io.downloader.robots_allowed(url):continue
            try:
                page_url,page_html=(final,html) if url==final else await self._page(url)
                for d in archive_documents(page_html,page_url):documents[d['url']]=d
                form=archive_form_config(page_html)
                if form and await self.io.downloader.robots_allowed(form['endpoint']):
                    for year in form['years']:
                        if budget<=0:break
                        try:
                            state=await self.checkpoints.get(self.id,page_url,int(year))
                            pages=list(state['pages']);seen=set(state['completed_pages'])
                            for number in pages:
                                if number in seen:continue
                                if budget<=0:break
                                budget-=1
                                _,body=await self._page(form['endpoint'],{'action':'list_dwnlds','security':form['security'],'nse_id':form['category'],'tags':year,'page':str(number),'limit':form['limit'],'expiry':form['expiry']})
                                if body.strip() in ('-1','0'):raise ValueError('Publisher archive form expired or rejected')
                                docs=archive_documents(body,page_url,{'archiveYear':int(year),'archivePage':number,'category':form['category']})
                                # Only advance after the documents survive a restart.
                                await self.jobs.enqueue(self.id,docs)
                                for d in docs:documents[d['url']]=d
                                discovered=archive_page_numbers(body)
                                await self.checkpoints.complete(self.id,page_url,int(year),number,discovered)
                                seen.add(number)
                                for next_page in discovered:
                                    if next_page not in pages:pages.append(next_page)
                        except Exception:continue # Failed year keeps its durable uncompleted pages.
                for next_url in discover_archive_links(page_html,page_url):
                    if official_nse_url(next_url) and next_url not in visited and next_url not in urls:urls.append(next_url)
            except Exception:continue # One failed category cannot discard already discovered filings.
        return list(documents.values())

    async def fetch(self,document):return await self.io.fetch_document(document,'nse','scraper-phase6-0.1.0')

    async def parse(self,fetched):
        entity={'companyName':fetched['document'].get('title'),'ticker':None,'exchange':'NSE'}
        if 'application/pdf' not in (fetched.get('contentType') or '') and not re.search(r'\.pdf(?:[?#]|$)',fetched['document']['url'],re.I):
            return {'method':'html','confidence':None,'text':None,'tables':[],'entity':entity,'needsReview':True}
        result=await self.pdf.extract(fetched['artifact'].path)
        return dict(result,entity=entity)
