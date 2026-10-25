import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]??'app/dist'),assets=path.join(root,'assets');
const issuer='https://ep-nameless-voice-b4ygobrp.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth';
const candidates=fs.readdirSync(assets).filter(name=>/^Auth-[\w-]+\.js$/.test(name));
if(candidates.length!==1||!fs.readFileSync(path.join(assets,candidates[0]),'utf8').includes(issuer))throw Error('Production Auth artifact is missing the production managed issuer; deployment refused');
console.log(JSON.stringify({productionAuthArtifact:candidates[0],managedIssuerPinned:true}));
