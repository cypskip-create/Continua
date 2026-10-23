import fs from 'node:fs';
import path from 'node:path';
import {stagingConnection} from './safety.mjs';

// Deliberately tied to this migration's isolated branch, never an implicit
// Neon CLI context or production URL. No secrets are accepted on the CLI.
export function readStagingFixtureInputs(){
 const root=process.env.CONTINUA_MIGRATION_PRIVATE_DIR;
 if(!root||!path.isAbsolute(root))throw Error('Set CONTINUA_MIGRATION_PRIVATE_DIR to the protected migration directory');
 const manifest=JSON.parse(fs.readFileSync(process.env.CONTINUA_MIGRATION_MANIFEST??'.qa-artifacts/neon-migration/staging-branch.json','utf8'));
 if(manifest.branch?.id!=='br-still-field-b4mo8s63'||!manifest.endpoints?.some(endpoint=>endpoint.branch_id===manifest.branch.id&&endpoint.host==='ep-curly-cell-b4cvhxkd.c-6.us-east-2.aws.neon.tech'))throw Error('Fixture target must be the original isolated migration branch');
 const url=stagingConnection(fs.readFileSync(path.join(root,'neon-staging.url'),'utf8'),manifest,'orange-bird-13151544');
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 return {root,url};
}
