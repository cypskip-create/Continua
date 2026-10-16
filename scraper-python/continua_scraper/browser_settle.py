"""Bounded network + DOM quiescence; a short sleep is not complete data coverage."""
import json
import time
from urllib.parse import urlsplit


class PublisherSettle:
    def __init__(self, *, clock=time.monotonic, quiet_seconds=.75,allowed_hosts=()):
        self.clock, self.quiet_seconds = clock, quiet_seconds
        self.pending = set()
        self.last_activity = clock()
        self.snapshot = None
        self.status = None
        self.allowed_hosts=tuple(allowed_hosts)

    def observe(self, records, snapshot, busy=False):
        now = self.clock()
        for record in records:
            try:
                event = json.loads(record['message'])['message']
                method, params = event['method'], event['params']
                request_id = params.get('requestId')
                if method == 'Network.requestWillBeSent' and params.get('type') not in ('WebSocket', 'EventSource'):
                    if self.allowed_hosts:
                        host=urlsplit(params.get('request',{}).get('url','')).hostname or ''
                        if not any(host==root or host.endswith('.'+root) for root in self.allowed_hosts):continue
                    self.pending.add(request_id)
                    if len(self.pending) > 2000:
                        raise ValueError('Publisher request tracking limit')
                    self.last_activity = now
                elif method in ('Network.loadingFinished', 'Network.loadingFailed'):
                    if request_id not in self.pending:continue
                    self.pending.discard(request_id)
                    self.last_activity = now
                elif method == 'Network.responseReceived' and params.get('type') == 'Document':
                    self.status = int(params['response']['status'])
            except (KeyError, TypeError, json.JSONDecodeError):
                continue
        if snapshot != self.snapshot:
            self.snapshot = snapshot
            self.last_activity = now
        if self.status is not None and self.status >= 400:
            raise ValueError('Publisher HTTP error')
        return not busy and not self.pending and now - self.last_activity >= self.quiet_seconds


def settled_view(driver, monitor):
    snapshot = driver.execute_script("return [document.body.scrollHeight,document.querySelectorAll('tr').length,document.querySelectorAll('.file-content').length,document.body.innerText]")
    busy = driver.execute_script("return Array.from(document.querySelectorAll('[aria-busy=true]')).some(n=>n.getClientRects().length>0)")
    return monitor.observe(driver.get_log('performance'), snapshot, busy)
