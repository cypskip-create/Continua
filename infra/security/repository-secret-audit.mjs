// High-signal tracked-file audit. Diagnostics never include matched credentials.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});if(files.status!==0)throw Error('Tracked file inventory unavailable');
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],['provider-secret',/\b(?:sb_secret_[A-Za-z0-9_-]{24,}|sk_(?:live|test)_[a-f0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],['assigned-storage-secret',/R2_SECRET_ACCESS_KEY\s*[:=]\s*["'][A-Za-z0-9+/=_-]{32,}["']/]];
let failures=0,checked=0;
for(const file of files.stdout.split('\0').filter(Boolean)){
 let body;try{const bytes=readFileSync(file);if(bytes.includes(0)||bytes.length>4194304)continue;body=bytes.toString('utf8');}catch{continue;}
 checked++;for(const [rule,pattern]of rules)if(pattern.test(body)){console.error(JSON.stringify({file,rule}));failures++;}
 for(const match of body.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/g)){
  try{const payload=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString());if(payload.role==='service_role'){console.error(JSON.stringify({file,rule:'privileged-jwt'}));failures++;}}catch{/* Not a JWT. */}
 }
}
console.log(JSON.stringify({trackedFilesChecked:checked,secretFindings:failures}));if(failures)process.exitCode=1;
