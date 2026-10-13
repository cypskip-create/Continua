/** Loopback-only native Go data-path smoke, no user tokens/provider calls/writes.
 * Uses an existing owned DB connection and an ephemeral fixture development key.
 */
import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../backend/.env.local',import.meta.url)),quiet:true});
const connection=process.env.DATABASE_URL;
if(!connection)throw new Error('Owned database connection unavailable');
const url=new URL(connection);
if(!url.username.includes('jjsetogmnumoudrovpzn')&&!url.hostname.includes('jjsetogmnumoudrovpzn'))throw new Error('Owned database connection unavailable');
const binary=fileURLToPath(new URL('../../.qa-artifacts/continua-native.exe',import.meta.url));
const child=spawn(binary,[],{windowsHide:true,stdio:['ignore','ignore','ignore'],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,
 DATABASE_URL:connection,DEV_API_KEY:'fixture-loopback-candidate-only',NODE_ENV:'development'}});
let exited=false;child.once('exit',()=>{exited=true;});
const origin='http://127.0.0.1:4080';
try{
 let ready=false;
 for(let attempt=0;attempt<20&&!exited;attempt++){
  try{const r=await fetch(origin+'/api/v1/health/live',{signal:AbortSignal.timeout(1000)});const data=await r.json();ready=r.ok&&data.implementation==='go';if(ready)break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw new Error('Native candidate did not start');
 const checks=[];
 for(const [path,expected,authorized] of [['/api/v1/health',503,false],['/api/v1/quotes?symbols=SCOM,KCB,EQTY',401,false],['/api/v1/quotes?symbols=SCOM,KCB,EQTY',200,true],['/api/v1/sectors',200,true],['/api/v1/instruments',200,true]]){
  const r=await fetch(origin+path,{headers:authorized?{'X-API-Key':'fixture-loopback-candidate-only'}:{},signal:AbortSignal.timeout(15000)});
  const body=await r.json();const records=Array.isArray(body.data)?body.data.length:null;
  checks.push({path,status:r.status,expected,passed:r.status===expected,...(records!==null?{records}:{})});
  if(r.status!==expected)throw new Error('Native data-path smoke failed');
  if(authorized&&path.includes('/quotes')&&records!==3)throw new Error('Native quote data missing');
 }
 console.log(JSON.stringify({nativeGoLoopback:true,ownedDatabaseReads:true,productionCutover:false,checks}));
}finally{child.kill();}
