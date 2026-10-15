"""Source-bound TLS tunnel; Chromium cannot reach private or unapproved hosts.

The browser retains end-to-end certificate verification. No TLS decryption,
cookies/keys, authentication bypass or generic outbound proxy is provided.
"""
import asyncio
from .policy import resolve_public

class BrowserProxy:
    def __init__(self,policy,*,max_bytes=50*1024*1024):
        if type(max_bytes) is not int or not 1<=max_bytes<=50*1024*1024:raise ValueError('Invalid browser transfer budget')
        self.policy,self.max_bytes=policy,max_bytes
        self.server=None;self.tasks=set();self.connections=0;self.transferred_bytes=0

    async def __aenter__(self):
        self.server=await asyncio.start_server(self._accept,'127.0.0.1',0,limit=32768)
        self.port=self.server.sockets[0].getsockname()[1]
        return self

    async def __aexit__(self,*exc):
        self.server.close();await self.server.wait_closed()
        tasks=list(self.tasks)
        for task in tasks:task.cancel()
        if tasks:await asyncio.gather(*tasks,return_exceptions=True)

    async def _accept(self,reader,writer):
        task=asyncio.current_task();self.tasks.add(task)
        remote=None
        if self.connections>=4 or self.transferred_bytes>=self.max_bytes:
            writer.close();self.tasks.discard(task);return
        self.connections+=1
        try:
            async with asyncio.timeout(90):
                header=await reader.readuntil(b'\r\n\r\n')
                if len(header)>32768:raise ValueError('Browser proxy header limit')
                method,target,protocol=header.split(b'\r\n',1)[0].decode('ascii').split(' ')
                if method!='CONNECT' or protocol not in ('HTTP/1.0','HTTP/1.1'):raise ValueError('Only source TLS tunnels are supported')
                parsed=self.policy.check_url('https://'+target)
                if parsed.path or parsed.query or parsed.fragment or parsed.port!=443:raise ValueError('Invalid browser tunnel')
                addresses=await resolve_public(parsed.hostname,443)
                upstream,remote=await asyncio.open_connection(addresses[0],443)
                writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n');await writer.drain()
                async def relay(source,destination):
                    while data:=await source.read(65536):
                        # One budget for the entire rendered page, not a fresh
                        # allowance for every asset/connection or retry.
                        self.account_transfer(len(data))
                        destination.write(data);await destination.drain()
                    try:destination.write_eof()
                    except (OSError,NotImplementedError):pass
                async with asyncio.TaskGroup() as group:
                    group.create_task(relay(reader,remote));group.create_task(relay(upstream,writer))
        except asyncio.CancelledError:raise
        except Exception:pass # Never emit private tunnel destinations/error details.
        finally:
            if remote:remote.close()
            writer.close()
            for stream in (remote,writer):
                if stream:
                    try:await stream.wait_closed()
                    except Exception:pass
            self.connections-=1;self.tasks.discard(task)

    def account_transfer(self,size):
        if type(size) is not int or size<0:raise ValueError('Invalid transfer accounting')
        self.transferred_bytes+=size
        if self.transferred_bytes>self.max_bytes:raise ValueError('Browser page transfer exceeds limit')
