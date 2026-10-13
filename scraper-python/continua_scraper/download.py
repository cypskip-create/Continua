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
from dataclasses import dataclass
from urllib.parse import urljoin
from .policy import resolve_public, robots_allows

@dataclass(frozen=True)
class Artifact:
    path: pathlib.Path
    url: str
    content_type: str
    size: int
    sha256: str

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
    def __init__(self, policy, *, max_bytes=50*1024*1024, directory=None):
        self.policy=policy
        self.max_bytes=max_bytes
        self.directory=directory
        self.slots=asyncio.Semaphore(1)
        self.next_request={}
        self.robots={}

    async def _connection(self, url):
        parsed=self.policy.check_url(url)
        host=parsed.hostname
        port=parsed.port or (443 if parsed.scheme=="https" else 80)
        addresses=await resolve_public(host,port)
        wait=self.next_request.get(host,0)-time.monotonic()
        if wait>0:
            await asyncio.sleep(wait)
        self.next_request[host]=time.monotonic()+1
        tls=ssl.create_default_context() if parsed.scheme=="https" else None
        # The socket uses the vetted address, while TLS verifies the hostname.
        reader,writer=await asyncio.open_connection(addresses[0],port,ssl=tls,server_hostname=host if tls else None,limit=32768)
        target=(parsed.path or "/")+("?"+parsed.query if parsed.query else "")
        host_header=host if parsed.port is None else f"{host}:{port}"
        request=f"GET {target} HTTP/1.1\r\nHost: {host_header}\r\nUser-Agent: {self.policy.user_agent}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n"
        try:
            writer.write(request.encode("ascii"));await writer.drain()
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
            if headers.get("content-encoding","").lower() not in ("","identity"):
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
                await copy_body(reader,headers,content,1024*1024)
                text=content.getvalue().decode("utf-8",errors="replace")
            else:
                # Challenge, authorization failure or unavailable robots is not
                # permission to scrape. Never solve/bypass publisher challenges.
                return False
            self.robots[origin]=(time.monotonic()+3600,text)
            return robots_allows(text,self.policy.user_agent,url)
        finally:
            writer.close();await writer.wait_closed()

    async def fetch(self, url):
        async with self.slots:
            async with asyncio.timeout(60):
                for hop in range(6):
                    self.policy.check_url(url)
                    if not await self._robots_allowed(url):
                        raise PermissionError("Source robots policy prevents collection")
                    status,headers,reader,writer=await self._connection(url)
                    try:
                        if status in (301,302,303,307,308):
                            if hop==5 or not headers.get("location"):
                                raise ValueError("Source redirect limit")
                            url=urljoin(url,headers["location"])
                            self.policy.check_url(url)
                            continue
                        if status!=200:
                            raise ValueError(f"Source HTTP {status}; retained job must retry")
                        file=tempfile.NamedTemporaryFile(prefix="continua-native-",suffix=".raw",dir=self.directory,delete=False)
                        try:
                            with file:
                                size,digest=await copy_body(reader,headers,file,self.max_bytes)
                            return Artifact(pathlib.Path(file.name),url,headers.get("content-type","application/octet-stream"),size,digest)
                        except BaseException:
                            pathlib.Path(file.name).unlink(missing_ok=True)
                            raise
                    finally:
                        writer.close();await writer.wait_closed()
                raise ValueError("Source redirect limit")
