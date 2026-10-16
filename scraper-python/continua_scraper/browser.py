"""Native Python/Selenium renderer isolated from backend and storage secrets."""
import json
import os
import pathlib
import sys
from .browser_proxy import BrowserProxy
from .process import run_process,NativeWorkerError

class PublisherRenderError(ValueError):
    def __init__(self,code):
        self.safe_code=f'browser_exit_{code}' if type(code) is int and 1<=code<=19 else 'browser_exit_other'
        super().__init__(self.safe_code)

class BrowserRenderer:
    def __init__(self,queue,downloader,*,python=None,chromium=None,driver=None):
        self.queue,self.downloader=queue,downloader
        self.python=python or sys.executable
        self.chromium=chromium or os.environ.get('CHROMIUM_BIN','')
        self.driver=driver or os.environ.get('CHROMEDRIVER_BIN','')

    async def render(self,url,**options):
        self.downloader.policy.check_url(url)
        if not await self.downloader.robots_allowed(url):raise PermissionError('Publisher robots prevents rendering')
        return await self.queue.run(lambda:self._render(url,options))

    async def _render(self,url,options):
        if not self.chromium or not self.driver:raise ValueError('Native Chromium/ChromeDriver configuration is required')
        worker=pathlib.Path(__file__).resolve().parents[1]/'browser_worker.py'
        async with BrowserProxy(self.downloader.policy) as proxy:
            config={'url':url,'options':options,'proxyPort':proxy.port,'allowedHosts':list(self.downloader.policy.allowed_domains),'userAgent':self.downloader.policy.user_agent,'chromium':self.chromium,'driver':self.driver}
            # Configuration has no database, Paystack or R2 credentials. Input is
            # a bounded command argument; it never contains document bodies.
            try:raw=await run_process([self.python,worker,json.dumps(config)],timeout=150,max_output=12*1024*1024)
            except NativeWorkerError as error:
                raise PublisherRenderError(error.returncode) from None
        result=json.loads(raw)
        if not isinstance(result,dict) or not isinstance(result.get('html'),str) or len(result['html'].encode())>8*1024*1024:raise ValueError('Invalid rendered publisher document')
        self.downloader.policy.check_url(result.get('finalUrl'))
        if not await self.downloader.robots_allowed(result['finalUrl']):raise PermissionError('Publisher robots disallows final rendered destination')
        if result.get('status') is not None and result['status']>=400:raise ValueError('Rendered publisher returned an error')
        return result
