import fs from 'node:fs';import path from 'node:path';
export function readApprovedProductionInputs(){
 const root=process.env.CONTINUA_MIGRATION_PRIVATE_DIR;
 if(!root||!path.isAbsolute(root))throw Error('Protected migration directory required');
 const approval=JSON.parse(fs.readFileSync(path.join(root,'production-cutover-approval.json'),'utf8'));
 if(approval.productionCutover!==true||approval.projectId!=='orange-bird-13151544'||approval.branchId!=='br-noisy-block-b4z5yxup')throw Error('Explicit approval for the existing production branch is required');
 const url=new URL(fs.readFileSync(path.join(root,'neon-direct.snippet'),'utf8').trim());
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='ep-nameless-voice-b4ygobrp.c-6.us-east-2.aws.neon.tech'||url.pathname!=='/neondb'||!url.username||!url.password||!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw Error('Connection does not match the existing production endpoint');
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 return {root,url,approval};
}
