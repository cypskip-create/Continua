import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('artifact checks allow public identifiers and reject privileged JWT/provider credentials without echoing them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'continua-browser-audit-')), file = join(directory, 'fixture.js');
    const audit = fileURLToPath(new URL('../../infra/security/browser-secret-audit.mjs', import.meta.url));
    try {
        await writeFile(file, 'const project="public-project-id";const publishable="sb_publishable_public_fixture_only";');
        let result = spawnSync(process.execPath, [audit, directory], {encoding:'utf8', env:{...process.env,CONTINUA_BROWSER_AUDIT_ENV_FILES:''}});
        assert.equal(result.status, 0);assert.deepEqual(JSON.parse(result.stdout).findings, []);
        const token = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url') + '.fixtureSignature';
        const provider = 'sk-proj-' + 'fixtureOnly'.repeat(4);
        await writeFile(file, JSON.stringify({token, provider}));
        result = spawnSync(process.execPath, [audit, directory], {encoding:'utf8', env:{...process.env,CONTINUA_BROWSER_AUDIT_ENV_FILES:''}});
        assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).findings.length,1);
        assert.equal(result.stdout.includes(token),false);assert.equal(result.stdout.includes(provider),false);
    } finally {await unlink(file);await rmdir(directory);}
});
test('artifact checks detect managed session encryption keys and SMTP keys without printing them',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'continua-managed-audit-')),file=join(directory,'fixture.js'),envFile=join(directory,'server.env');
    const audit=fileURLToPath(new URL('../../infra/security/browser-secret-audit.mjs',import.meta.url));
    const sessionKey='ab'.repeat(32),smtp='smtp-fixture-only-credential';
    try{await writeFile(envFile,'NEON_AUTH_SESSION_KEY='+sessionKey+'\nAUTH_SMTP_KEY='+smtp);await writeFile(file,JSON.stringify({sessionKey,smtp}));const result=spawnSync(process.execPath,[audit,directory],{encoding:'utf8',env:{...process.env,CONTINUA_BROWSER_AUDIT_ENV_FILES:envFile}});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).serverValuesCompared,2);assert.equal(result.stdout.includes(sessionKey),false);assert.equal(result.stdout.includes(smtp),false);}finally{await unlink(file);await unlink(envFile);await rmdir(directory);}
});
