import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';
const {root,url}=readStagingFixtureInputs();
url.searchParams.set('sslmode','verify-full');
const credentials=JSON.parse(fs.readFileSync(path.join(root,'render-r2-secrets.json'),'utf8'));
const environment={...process.env,DATABASE_URL:url.href,RAW_STORAGE_DRIVER:'r2',R2_DUAL_WRITE:'false',NODE_ENV:'test'};
for(const name of ['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']){if(!credentials[name])throw Error('Existing private R2 reader is incomplete');environment[name]=credentials[name];}
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET'])delete environment[name];
const python=path.resolve('.qa-artifacts/native-scraper-venv/Scripts/python.exe');
const result=spawnSync(python,['infra/neon/collector-read-fixture.py'],{env:environment,encoding:'utf8',timeout:120000});
if(result.status!==0){console.error('Native collector staging read failed; private details omitted');process.exit(1);}
console.log(result.stdout.trim());
