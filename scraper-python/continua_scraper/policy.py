import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

class UnsafeURL(ValueError):
    pass

@dataclass(frozen=True)
class SourcePolicy:
    source_id: str
    allowed_domains: tuple[str, ...]
    redistribution_allowed: bool
    user_agent: str = "ContinuaBot/0.1"
    collection_allowed: bool | None = None
    allow_subdomains: bool = False

    def __post_init__(self):
        if not self.user_agent.isascii() or any(ord(c)<32 or ord(c)==127 for c in self.user_agent):
            raise ValueError("Invalid crawler identity")
        if not self.allowed_domains or any(not d or d!=d.lower() or "/" in d or "@" in d for d in self.allowed_domains):
            raise ValueError("Invalid source domain allowlist")

    def check_url(self, value):
        try:
            parsed=urlsplit(value)
            port=parsed.port
        except ValueError as error:
            raise UnsafeURL("Invalid source URL") from error
        if parsed.scheme not in ("http","https") or not parsed.hostname or parsed.username or parsed.password:
            raise UnsafeURL("Invalid source URL")
        if port not in (None,80,443) or "\r" in value or "\n" in value:
            raise UnsafeURL("Invalid source URL")
        hostname=parsed.hostname.lower().rstrip(".")
        if hostname not in self.allowed_domains and not (self.allow_subdomains and any(hostname.endswith('.'+domain) for domain in self.allowed_domains)):
            raise UnsafeURL("URL is outside the source allowlist")
        if not (self.redistribution_allowed if self.collection_allowed is None else self.collection_allowed):
            raise PermissionError("Source collection permission is required")
        return parsed

async def resolve_public(hostname, port):
    try:
        records=await asyncio.get_running_loop().getaddrinfo(hostname,port,type=socket.SOCK_STREAM)
    except OSError as error:
        raise UnsafeURL("Source DNS resolution failed") from error
    addresses=sorted({record[4][0] for record in records})
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise UnsafeURL("Private, reserved or mixed source DNS is forbidden")
    return addresses

def robots_allows(content, user_agent, url):
    parser=RobotFileParser()
    parser.parse(content.splitlines())
    return parser.can_fetch(user_agent,url)
