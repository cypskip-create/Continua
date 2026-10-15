"""Secret-free native subprocesses with deadlines and bounded stdout."""
import asyncio
import os
import signal

class NativeWorkerError(ValueError):
    def __init__(self,returncode):
        super().__init__('Native document worker failed')
        self.returncode=returncode

def child_environment():
    return {**{k:os.environ[k] for k in ('PATH','SystemRoot','WINDIR','TEMP','TMP') if k in os.environ},'PYTHONUTF8':'1','OMP_THREAD_LIMIT':'1'}

async def run_process(arguments,*,timeout=60,max_output=20*1024*1024):
    if os.name=='nt' and isinstance(asyncio.get_running_loop(),asyncio.SelectorEventLoop):
        # psycopg needs a Selector loop on Windows; Windows subprocess pipes
        # need Proactor. Run the SAME bounded worker protocol in a private
        # Proactor thread, forwarding cancellation to its owned process tree.
        import concurrent.futures
        import threading
        ready=concurrent.futures.Future();cancelled=threading.Event()
        def execute():
            with asyncio.Runner(loop_factory=asyncio.ProactorEventLoop) as runner:
                loop=runner.get_loop()
                task=loop.create_task(_run_process(arguments,timeout=timeout,max_output=max_output))
                ready.set_result((loop,task))
                if cancelled.is_set():task.cancel()
                async def wait():return await task
                return runner.run(wait())
        future=asyncio.get_running_loop().run_in_executor(None,execute)
        try:return await asyncio.shield(future)
        except asyncio.CancelledError:
            cancelled.set()
            if ready.done():
                loop,task=ready.result()
                if not loop.is_closed():loop.call_soon_threadsafe(task.cancel)
            try:await asyncio.shield(future)
            except BaseException:pass
            raise
    return await _run_process(arguments,timeout=timeout,max_output=max_output)

async def _run_process(arguments,*,timeout,max_output):
    options={'env':child_environment(),'stdin':asyncio.subprocess.DEVNULL,'stdout':asyncio.subprocess.PIPE,'stderr':asyncio.subprocess.DEVNULL}
    if os.name=='nt':options['creationflags']=0x08000000 # No visible interactive window.
    else:options['start_new_session']=True
    process=await asyncio.create_subprocess_exec(*map(str,arguments),**options)
    output=bytearray()
    try:
        async with asyncio.timeout(timeout):
            while chunk:=await process.stdout.read(65536):
                if len(output)+len(chunk)>max_output:raise ValueError('Native worker output exceeds limit')
                output.extend(chunk)
            code=await process.wait()
            if code!=0:raise NativeWorkerError(code)
            return bytes(output)
    finally:
        if process.returncode is None:
            if os.name=='nt':
                # Kill only the tree of the process created above, never a
                # browser name/global PID scan or a shared desktop browser.
                killer=await asyncio.create_subprocess_exec('taskkill','/PID',str(process.pid),'/T','/F',stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL,creationflags=0x08000000)
                await killer.wait()
            else:
                try:os.killpg(process.pid,signal.SIGKILL)
                except ProcessLookupError:pass
            await process.wait()
        elif os.name!='nt':
            # Also clean descendants if a failed parent exited on its own.
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
