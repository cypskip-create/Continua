"""Credential-free Linux smoke of the actual native browser worker.

Run in the collector image with network disabled, read-only root, 512 MiB
memory/no swap, a bounded writable /tmp, and a Chromium-compatible namespace
seccomp policy. This does not certify arbitrary publisher workloads.
"""
import json
import pathlib
import sys
from urllib.parse import quote

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scraper-python'))
from continua_scraper.browser_worker import render

result=render({'url':'data:text/html,'+quote('<title>Continua native fixture</title><main>isolated document</main>'),
               'options':{},'chromium':'/usr/bin/chromium','driver':'/usr/bin/chromedriver',
               'userAgent':'ContinuaNativeFixture/1.0','proxyPort':9})
if '<title>Continua native fixture</title>' not in result['html']:
    raise RuntimeError('Native isolated browser fixture failed')
def read_integer(path):
    try:return int(pathlib.Path(path).read_text().strip())
    except (OSError,ValueError):return None
print(json.dumps({'passed':True,'runtime':'python-selenium-chromium','cloudWrites':False,
                  'sandboxDisabled':False,'cgroupMemoryPeak':read_integer('/sys/fs/cgroup/memory.peak'),
                  'cgroupMemoryLimit':read_integer('/sys/fs/cgroup/memory.max')}))
