"""Measure owned fixture workers. Host results are not a Render release gate."""
import concurrent.futures
import ctypes
import datetime
import json
import os
import pathlib
import subprocess
import sys
import threading
import time

ROOT=pathlib.Path(__file__).resolve().parents[2]

def rss(pid):
    if os.name=='nt':
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(name,ctypes.c_size_t) for name in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
        handle=kernel.OpenProcess(0x0410,False,pid)
        if not handle:return None
        try:
            counters=Counters();counters.cb=ctypes.sizeof(counters)
            return int(counters.PeakWorkingSetSize) if psapi.GetProcessMemoryInfo(handle,ctypes.byref(counters),counters.cb) else None
        finally:kernel.CloseHandle(handle)
    try:
        for line in pathlib.Path(f'/proc/{pid}/status').read_text().splitlines():
            if line.startswith('VmHWM:'):return int(line.split()[1])*1024
    except (FileNotFoundError,PermissionError):return None

def run(request):
    env={key:os.environ[key] for key in ('PATH','SystemRoot','WINDIR') if key in os.environ};env['PYTHONUTF8']='1'
    encoded=json.dumps(request,separators=(',',':')).encode();start=time.monotonic()
    process=subprocess.Popen([sys.executable,str(ROOT/'engine-python/worker.py'),'--research'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,**({'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}))
    result={}
    def collect():
        try:result['output'],result['error']=process.communicate(encoded,timeout=10)
        except subprocess.TimeoutExpired:process.kill();result['output'],result['error']=process.communicate();result['timedOut']=True
    collector=threading.Thread(target=collect);collector.start();peak=0;samples=0
    try:
        while process.poll() is None:
            memory=rss(process.pid)
            if memory is not None:peak=max(peak,memory);samples+=1
            time.sleep(.02)
    finally:
        collector.join(timeout=12)
        if collector.is_alive():process.kill();collector.join()
    output=result.get('output',b'')
    if process.returncode!=0 or result.get('timedOut') or len(output)>4194304:raise RuntimeError('Bounded fixture worker failed')
    data=json.loads(output)
    if (request['operation']=='run_advanced' and data.get('status')!=200) or (request['operation']=='portfolio_workspace' and data.get('available') is not True):raise RuntimeError('Fixture research rejected')
    return {'operation':request['operation'],'inputBytes':len(encoded),'outputBytes':len(output),'wallSeconds':round(time.monotonic()-start,3),'sampledPeakWorkerResidentBytes':peak if samples else None,'memorySamples':samples,'passed':True}

def main():
    start=datetime.date(2020,1,1)
    points=[{'date':(start+datetime.timedelta(days=i)).isoformat(),'close':100+(i%13)/10} for i in range(1500)]
    url='https://fixture.example/'+('a'*2000)
    request={'operation':'run_advanced','args':[{'kind':'bootstrap','points':points,'sourceUrl':url,'additionalSourceUrls':[url]*1500,'paths':1000,'horizon':252,'seed':123,'blockSize':20},'2026-10-14T12:00:00.000Z']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:results=list(executor.map(run,[request,request]))
    positions=[{'symbol':f'FIXTURE{i:04d}','price':100,'shares':10,'cost':900,'change':1,'volume':100000,'sector':'Fixture','currency':'KES','asOf':'2026-10-14T09:00:00Z'} for i in range(2000)]
    histories=[{'symbol':p['symbol'],'blocked':False,'bars':[{'timestamp':(start+datetime.timedelta(days=i)).isoformat()+'T12:00:00Z','close':100+(i%13)/10,'sourceUrl':url} for i in range(252)]} for p in positions[:10]]
    companies={p['symbol']:{'financialAnalysis':{'period':2025,'metrics':{},'findings':[]},'briefing':{'facts':['Fixture evidence '+('a'*2000)]*20,'risks':[]},'quality':{'warnings':[]},'news':[],'changes':{'changes':[]},'unavailable':[]} for p in positions[:20]}
    workspace={'operation':'portfolio_workspace','args':[{'positions':positions,'histories':histories,'companies':companies,'dividends':[],'snapshots':[],'flows':[],'periodFlows':[],'persistenceAvailable':True},'2026-10-14T12:00:00.000Z']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:results.extend(executor.map(run,[request,workspace]))
    cgroup={}
    if sys.platform.startswith('linux'):
        for name in ('memory.max','memory.peak','memory.swap.max','memory.events'):
            path=pathlib.Path('/sys/fs/cgroup')/name
            if path.is_file():cgroup[name]=path.read_text().strip()
    print(json.dumps({'fixtureOnly':True,'networkUsed':False,'hostPlatform':sys.platform,'concurrentWorkers':2,'results':results,'cgroup':cgroup,'releaseGatePassed':False,'limits':'Owned numerical workers only, not combined Go/collector/Chromium or restart/load coverage. Full Linux 512MB integration remains required.'}))

if __name__=='__main__':main()
