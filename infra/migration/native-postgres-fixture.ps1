# Disposable development fixture only. Never reads DATABASE_URL or existing DBs.
param(
    [string]$DockerPath = 'C:/Users/cypri/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe'
)
$ErrorActionPreference = 'Stop'
$nativeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$nativeGo = Join-Path $nativeRoot '.qa-artifacts/toolchains/go/bin/go.exe'
if (-not (Test-Path -LiteralPath $nativeGo)) { throw 'Local Go toolchain missing' }
$nativeID = ''
$nativeName = 'continua-native-pg-fixture-' + [guid]::NewGuid().ToString('N')
$nativePreviousURL = $env:NATIVE_POSTGRES_FIXTURE_URL
$nativeCollectorPreviousURL = $env:NATIVE_COLLECTOR_POSTGRES_FIXTURE_URL
try {
    $nativeID = (& $DockerPath run -d --rm --name $nativeName --label 'continua.fixture=native-postgres' `
        --user 70:70 --read-only --cap-drop ALL --security-opt no-new-privileges `
        --memory 256m --memory-swap 256m --cpus 1 --pids-limit 128 `
        --tmpfs '/tmp:rw,nosuid,noexec,size=16m' `
        --tmpfs '/var/run/postgresql:rw,nosuid,noexec,size=4m,uid=70,gid=70' `
        --tmpfs '/var/lib/postgresql/data:rw,nosuid,noexec,size=128m,uid=70,gid=70,mode=0700' `
        -p '127.0.0.1::5432' -e 'POSTGRES_PASSWORD=continua-fixture-only' -e 'POSTGRES_DB=continua_native_fixture' `
        'postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24' `
        postgres -c shared_buffers=16MB -c max_connections=10).Trim()
    if ($LASTEXITCODE -ne 0 -or $nativeID -notmatch '^[a-f0-9]{64}$') { throw 'Fixture creation failed' }
    $nativeReady = $false
    for ($nativeAttempt=0; $nativeAttempt -lt 15; $nativeAttempt++) {
        & $DockerPath exec $nativeID pg_isready -h 127.0.0.1 -U postgres -d continua_native_fixture *> $null
        if ($LASTEXITCODE -eq 0) { $nativeReady=$true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $nativeReady) { throw 'Fixture startup failed' }
    $nativeBinding = (& $DockerPath port $nativeID 5432/tcp).Trim()
    if ($nativeBinding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Fixture is not loopback bound' }
    $nativePort = $Matches[1]
    $env:NATIVE_POSTGRES_FIXTURE_URL = "postgresql://postgres:continua-fixture-only@127.0.0.1:$nativePort/continua_native_fixture?sslmode=disable&application_name=continua-native-fixture"
    $env:GOCACHE = Join-Path $nativeRoot '.qa-artifacts/go-cache'
    $env:GOPATH = Join-Path $nativeRoot '.qa-artifacts/go-path'
    & $nativeGo -C (Join-Path $nativeRoot 'backend-go') test ./internal/marketdata -run '^TestPostgresOwnedFixtureMigrationAndAtomicQuoteOutbox$' -count=1 -v
    if ($LASTEXITCODE -ne 0) { throw 'Native PostgreSQL fixture failed' }
    $env:NATIVE_COLLECTOR_POSTGRES_FIXTURE_URL=$env:NATIVE_POSTGRES_FIXTURE_URL
    & (Join-Path $nativeRoot '.qa-artifacts/native-scraper-venv/Scripts/python.exe') -m unittest discover -s (Join-Path $nativeRoot 'scraper-python/tests') -p 'test_postgres_collector.py' -v
    if ($LASTEXITCODE -ne 0) { throw 'Native collector PostgreSQL fixture failed' }
}
finally {
    $env:NATIVE_POSTGRES_FIXTURE_URL = $nativePreviousURL
    $env:NATIVE_COLLECTOR_POSTGRES_FIXTURE_URL = $nativeCollectorPreviousURL
    if ($nativeID -match '^[a-f0-9]{64}$') {
        $nativeLabel = (& $DockerPath inspect --format '{{index .Config.Labels "continua.fixture"}}' $nativeID).Trim()
        if ($nativeLabel -ne 'native-postgres') { throw 'Refusing cleanup: fixture identity mismatch' }
        & $DockerPath stop --timeout 3 $nativeID
        if ($LASTEXITCODE -ne 0) { throw 'Disposable fixture cleanup failed' }
    }
}
