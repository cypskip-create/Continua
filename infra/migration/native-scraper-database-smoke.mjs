import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../backend/.env.local',import.meta.url)),quiet:true});
const connection=process.env.DATABASE_URL;let url;
try{url=new URL(connection);}catch{throw new Error('Owned database connection unavailable');}
if(!url.username.includes('jjsetogmnumoudrovpzn')&&!url.hostname.includes('jjsetogmnumoudrovpzn'))throw new Error('Owned database connection unavailable');
const python=process.env.NATIVE_SCRAPER_PYTHON_BIN;
if(!python)throw new Error('Set NATIVE_SCRAPER_PYTHON_BIN to the isolated dependency environment');
const execution=spawnSync(python,[fileURLToPath(new URL('./native_scraper_database_smoke.py',import.meta.url))],{windowsHide:true,encoding:'utf8',timeout:45000,maxBuffer:65536,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1',DATABASE_URL:connection}});
if(execution.status!==0)throw new Error('Native Python read-only database smoke failed');
const result=JSON.parse(execution.stdout);if(!result.nativePythonPostgreSQL || !result.transactionReadOnly)throw new Error('Native Python read-only database smoke failed');
console.log(JSON.stringify(result));
