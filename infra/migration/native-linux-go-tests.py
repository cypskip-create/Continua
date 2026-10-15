"""Execute compiled native Go fixtures in an isolated Linux container."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

def main():
    root=pathlib.Path('/app');artifacts=root/'native-linux-tests';results=[]
    # Derive the exhaustive fixture inventory from repository test packages.
    # New configuration/operator packages cannot be silently omitted by a
    # hand-maintained allowlist. Colliding binary names fail closed.
    package_directories={}
    for tree in ('internal','cmd'):
        for source in (root/'backend-go'/tree).rglob('*_test.go'):
            directory=source.parent;name=directory.name
            if name in package_directories and package_directories[name]!=directory:
                raise RuntimeError('Ambiguous native fixture binary name')
            package_directories[name]=directory
    expected=set(package_directories)
    if not expected:raise RuntimeError('Native fixture source inventory missing')
    files={p.stem:p for p in artifacts.glob('*.test')}
    if set(files)!=expected:raise RuntimeError('Incomplete compiled Go fixture inventory')
    environment={'PATH':os.environ['PATH'],'NATIVE_PYTHON_BIN':'/usr/local/bin/python','PYTHONUTF8':'1','PYTHONDONTWRITEBYTECODE':'1','GOMEMLIMIT':'300MiB'}
    for package in sorted(files):
        with tempfile.TemporaryDirectory(prefix='continua-go-fixture-') as directory:
            binary=pathlib.Path(directory)/(package+'.test');shutil.copyfile(files[package],binary);binary.chmod(0o700)
            package_dir=package_directories[package]
            execution=subprocess.run([str(binary),'-test.v','-test.timeout=90s','-test.parallel=1'],cwd=package_dir,env=environment,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=100)
            output=execution.stdout.decode(errors='replace')
            skips=[line.strip() for line in output.splitlines() if line.strip().startswith('--- SKIP:')]
            allowed={'cache':['--- SKIP: TestRedisOwnedFixtureRoundTripTTLAndOversizedReplyGuard '],
                     'marketdata':['--- SKIP: TestPostgresOwnedFixtureMigrationAndAtomicQuoteOutbox '],
                     'engine':['--- SKIP: TestOwnedReadOnlyNewsDeadline ']}
            unexpected=[line for line in skips if not any(line.startswith(prefix) for prefix in allowed.get(package,[]))]
            if execution.returncode!=0 or unexpected:
                print(output,flush=True);raise RuntimeError('Native Linux Go fixture failed: '+package)
            results.append({'package':package,'passed':True,'separateFixtureRequired':skips})
    cgroup={}
    for name in ('memory.max','memory.peak','memory.swap.max','memory.events'):
        path=pathlib.Path('/sys/fs/cgroup')/name
        if path.is_file():cgroup[name]=path.read_text().strip()
    print(json.dumps({'linuxGoFixturePackages':results,'pythonWorkerIntegrationEnabled':True,'network':'loopback-only; external network disabled','cgroup':cgroup,'passed':True,'productionCutover':False,'limits':'Fixtures are not full collector/Chromium, hosted provider or restart/load validation.'}))

if __name__=='__main__':main()
