"""Bounded HTTP/1.1 native downloader with DNS-pinned, verified TLS connections.
Robots policy is checked for every destination, including redirects. Artifacts
stream to disk instead of accumulating full PDFs in the application heap.
"""
import asyncio
import hashlib
import pathlib
import ssl
import tempfile
import time
import math
import zlib
from dataclasses import dataclass
from urllib.parse import urljoin,urlencode,quote
from .policy import resolve_public, robots_allows
from .retry import with_retry
from .transfer_budget import MeteredReader,account

class SourceHTTPError(ValueError):
    def __init__(self,status):self.status=status;super().__init__('Source HTTP failure')

class SourceNotModified(SourceHTTPError):
    def __init__(self):super().__init__(304)

def cache_validator(value):
    return value if isinstance(value,str) and 0<len(value)<=512 and all(32<=ord(c)<=126 for c in value) else None

def transient_source_error(error):
    if isinstance(error,(ssl.SSLCertVerificationError,PermissionError)):return False
    if isinstance(error,SourceHTTPError):return error.status in (500,502,503,504)
    return isinstance(error,(TimeoutError,OSError))

_host_next_request={}

@dataclass(frozen=True)
class Artifact:
    path: pathlib.Path
    url: str
    content_type: str
    size: int
    sha256: str
    content_encoding: str | None = None
    http_etag: str | None = None
    http_last_modified: str | None = None

class DecodedWriter:
    """Bound allocation on decompressed bytes, including gzip bomb inputs."""
    def __init__(self,destination,encoding,max_bytes):
        self.destination,self.encoding,self.max_bytes=destination,encoding.lower(),max_bytes
        self.size=0;self.digest=hashlib.sha256()
        self.decoder=None if self.encoding in ('','identity') else zlib.decompressobj(31 if self.encoding in ('gzip','x-gzip') else 15)
        if self.encoding not in ('','identity','gzip','x-gzip','deflate'):raise ValueError('Unsupported source compression')
    def _output(self,data):
        self.size+=len(data)
        if self.size>self.max_bytes:raise ValueError('Source response exceeds limit after decompression')
        self.destination.write(data);self.digest.update(data)
    def write(self,data):
        if self.decoder is None:self._output(data);return
        pending=data
        while pending:
            if self.decoder.eof:
                if self.encoding not in ('gzip','x-gzip'):raise ValueError('Trailing compressed source bytes')
                self.decoder=zlib.decompressobj(31)
            output=self.decoder.decompress(pending,65536)
            self._output(output)
            pending=self.decoder.unused_data if self.decoder.eof else self.decoder.unconsumed_tail
    def finish(self):
        if self.decoder is not None and not self.decoder.eof:raise ValueError('Truncated compressed source response')
        return self.size,self.digest.hexdigest()

async def copy_decoded_body(reader,headers,destination,max_bytes):
    output=DecodedWriter(destination,headers.get('content-encoding',''),max_bytes)
    await copy_body(reader,headers,output,max_bytes)
    return output.finish()

async def copy_body(reader, headers, destination, max_bytes):
    digest=hashlib.sha256()
    total=0
    async def consume(count):
        nonlocal total
        while count:
            data=await reader.read(min(count,65536))
            if not data:
                raise ValueError("Truncated source response")
            total+=len(data)
            if total>max_bytes:
                raise ValueError("Source response exceeds limit")
            destination.write(data)
            digest.update(data)
            count-=len(data)
    transfer=headers.get("transfer-encoding","").lower()
    length=headers.get("content-length")
    if transfer and (transfer!="chunked" or length is not None):
        raise ValueError("Ambiguous source response framing")
    if transfer:
        while True:
            line=await reader.readline()
            if not line.endswith(b"\r\n") or len(line)>128:
                raise ValueError("Invalid chunk framing")
            count=int(line.split(b";",1)[0],16)
            if count<0 or total+count>max_bytes:
                raise ValueError("Source response exceeds limit")
            if count==0:
                trailer_bytes=0
                while True:
                    line=await reader.readline()
                    trailer_bytes+=len(line)
                    if trailer_bytes>32768 or not line.endswith(b"\r\n"):
                        raise ValueError("Invalid response trailer")
                    if line==b"\r\n":
                        return total,digest.hexdigest()
            await consume(count)
            if await reader.readexactly(2)!=b"\r\n":
                raise ValueError("Invalid chunk terminator")
    elif length is not None:
        if not length.isdigit() or int(length)>max_bytes:
            raise ValueError("Source response exceeds limit")
        await consume(int(length))
    else:
        while True:
            data=await reader.read(65536)
            if not data:
                break
            total+=len(data)
            if total>max_bytes:
                raise ValueError("Source response exceeds limit")
            destination.write(data)
            digest.update(data)
    return total,digest.hexdigest()

class Downloader:
    def __init__(self, policy, *, max_bytes=50*1024*1024, directory=None,requests_per_second=1):
        self.policy=policy
        self.max_bytes=max_bytes
        self.directory=directory
        self.slots=asyncio.Semaphore(1)
        self.next_request={}
        self.robots={}
        if not isinstance(requests_per_second,(int,float)) or not math.isfinite(requests_per_second) or not 0<requests_per_second<=10:
            raise ValueError('Invalid source request rate')
        self.request_interval=1/requests_per_second

    async def _connection(self, url,form=None,request_headers=None):
        if getattr(self,'light_workload',False):
            from .render_light import reserve_request
            reserve_request()
        parsed=self.policy.check_url(url)
        header_lines=''
        if request_headers is not None:
            if not isinstance(request_headers,dict) or len(request_headers)>3:raise ValueError('Source header budget')
            for name,value in request_headers.items():
                if name not in ('Accept','Referer','X-MSL-Chart','If-None-Match','If-Modified-Since') or not isinstance(value,str) or len(value)>4096 or any(ord(c)<32 or ord(c)>126 for c in value):raise ValueError('Invalid source request header')
                if name=='Referer':self.policy.check_url(value)
                header_lines+=name+': '+value+'\r\n'
        host=parsed.hostname
        port=parsed.port or (443 if parsed.scheme=="https" else 80)
        addresses=await resolve_public(host,port)
        if host not in _host_next_request and len(_host_next_request)>=2000:raise ValueError('Source host budget exceeded')
        now=time.monotonic();scheduled=max(now,_host_next_request.get(host,0))
        # Reserve before awaiting, so separate adapters cannot race a host's
        # configured rate budget. Cancellation only leaves a harmless short gap.
        _host_next_request[host]=scheduled+self.request_interval
        wait=scheduled-now
        if wait>0:
            await asyncio.sleep(wait)
        self.next_request[host]=_host_next_request[host]
        payload=urlencode(form).encode('ascii') if form is not None else b''
        if len(payload)>65536:raise ValueError('Source form exceeds limit')
        tls=ssl.create_default_context() if parsed.scheme=="https" else None
        # The socket uses the vetted address, while TLS verifies the hostname.
        reader,writer=await asyncio.open_connection(addresses[0],port,ssl=tls,server_hostname=host if tls else None,limit=32768)
        reader=MeteredReader(reader)
        target=quote(parsed.path or "/",safe="/%:@!$&'()*+,;=-._~")+("?"+quote(parsed.query,safe="%=&?/:@!$'()*+,;-._~") if parsed.query else "")
        host_header=host if parsed.port is None else f"{host}:{port}"
        method='POST' if form is not None else 'GET'
        extra=f'Content-Type: application/x-www-form-urlencoded\r\nContent-Length: {len(payload)}\r\n' if form is not None else ''
        extra+=header_lines
        request=f"{method} {target} HTTP/1.1\r\nHost: {host_header}\r\nUser-Agent: {self.policy.user_agent}\r\nAccept-Encoding: gzip, deflate\r\n{extra}Connection: close\r\n\r\n"
        try:
            account('uploadBytes',len(request.encode('ascii'))+len(payload))
            writer.write(request.encode("ascii")+payload);await writer.drain()
            status_line=await reader.readline()
            protocol,code,_=status_line.decode("ascii").rstrip().split(" ",2)
            if protocol not in ("HTTP/1.0","HTTP/1.1"):
                raise ValueError()
            status=int(code)
            headers={}
            header_bytes=len(status_line)
            while True:
                line=await reader.readline();header_bytes+=len(line)
                if header_bytes>32768 or not line.endswith(b"\r\n"):
                    raise ValueError("Invalid source headers")
                if line==b"\r\n":
                    break
                name,value=line.decode("latin-1").split(":",1)
                name=name.lower()
                if name in headers:
                    if name in ("content-length","transfer-encoding","location","content-type","content-encoding"):
                        raise ValueError("Duplicate source framing header")
                    headers[name]+=", "+value.strip()
                else:
                    headers[name]=value.strip()
            if headers.get("content-encoding","").lower() not in ("","identity","gzip","x-gzip","deflate"):
                raise ValueError("Unsupported source compression")
            return status,headers,reader,writer
        except BaseException:
            writer.close();await writer.wait_closed()
            raise

    async def _robots_allowed(self, url):
        parsed=self.policy.check_url(url)
        origin=f"{parsed.scheme}://{parsed.netloc}"
        cached=self.robots.get(origin)
        if cached and cached[0]>time.monotonic():
            return robots_allows(cached[1],self.policy.user_agent,url)
        status,headers,reader,writer=await self._connection(origin+"/robots.txt")
        import io
        try:
            if status in (404,410):
                text="User-agent: *\nAllow: /"
            elif status==200:
                content=io.BytesIO()
                await copy_decoded_body(reader,headers,content,1024*1024)
                text=content.getvalue().decode("utf-8",errors="replace")
            else:
                # Challenge, authorization failure or unavailable robots is not
                # permission to scrape. Never solve/bypass publisher challenges.
                return False
            self.robots[origin]=(time.monotonic()+3600,text)
            return robots_allows(text,self.policy.user_agent,url)
        finally:
            writer.close();await writer.wait_closed()

    async def robots_allowed(self,url):
        async with self.slots:
            async with asyncio.timeout(60):return await self._robots_allowed(url)

    async def fetch(self, url,*,form=None,request_headers=None):
        # Retrying a submitted POST could duplicate a source action/session.
        # Durable job recovery owns that decision; automatic retries are GET-only.
        return await with_retry(lambda:self._fetch_once(url,form=form,request_headers=request_headers),max_retries=0 if form is not None else 2,base_delay_ms=300,is_retryable=transient_source_error)

    async def _fetch_once(self, url,*,form=None,request_headers=None):
        async with self.slots:
            async with asyncio.timeout(60):
                for hop in range(6):
                    self.policy.check_url(url)
                    if not await self._robots_allowed(url):
                        raise PermissionError("Source robots policy prevents collection")
                    status,headers,reader,writer=await self._connection(url,form) if not request_headers else await self._connection(url,form,request_headers)
                    try:
                        if status in (301,302,303,307,308):
                            if hop==5 or not headers.get("location"):
                                raise ValueError("Source redirect limit")
                            previous=self.policy.check_url(url)
                            url=urljoin(url,headers["location"])
                            destination=self.policy.check_url(url)
                            if previous.hostname!=destination.hostname:request_headers=None
                            self.policy.check_url(url)
                            continue
                        if status==304 and request_headers and any(k in request_headers for k in ('If-None-Match','If-Modified-Since')):
                            raise SourceNotModified()
                        if status!=200:
                            raise SourceHTTPError(status)
                        if getattr(self,'light_workload',False) and 'text/html' not in headers.get('content-type',''):
                            raise ValueError('Light collector requires an HTML response')
                        file=tempfile.NamedTemporaryFile(prefix="continua-native-",suffix=".raw",dir=self.directory,delete=False)
                        try:
                            with file:
                                size,digest=await copy_decoded_body(reader,headers,file,self.max_bytes)
                            return Artifact(pathlib.Path(file.name),url,headers.get("content-type","application/octet-stream"),size,digest,http_etag=cache_validator(headers.get('etag')),http_last_modified=cache_validator(headers.get('last-modified')))
                        except BaseException:
                            pathlib.Path(file.name).unlink(missing_ok=True)
                            raise
                    finally:
                        writer.close();await writer.wait_closed()
                raise ValueError("Source redirect limit")
