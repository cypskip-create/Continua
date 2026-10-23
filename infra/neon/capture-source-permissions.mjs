import fs from 'node:fs';import path from 'node:path';import tls from 'node:tls';import pg from '../../backend/node_modules/pg/lib/index.js';import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
import {readStagingFixtureInputs} from './staging-fixture-inputs.mjs';import {captureBrowserPermissions} from './permissions.mjs';
const {root}=readStagingFixtureInputs();const source=new URL(dotenv.parse(fs.readFileSync('backend/.env.local')).DATABASE_URL);
if(!(source.hostname==='db.jjsetogmnumoudrovpzn.supabase.co'||source.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(source.username)==='postgres.jjsetogmnumoudrovpzn'))throw Error('Source is not the existing Continua project');
for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])source.searchParams.delete(key);
const database=new pg.Client({connectionString:source.href,ssl:{rejectUnauthorized:true,ca:[...tls.rootCertificates,fs.readFileSync('scraper-python/continua_scraper/supabase-root-2021.crt','utf8')]},connectionTimeoutMillis:15000});
try{
 await database.connect();await database.query('BEGIN READ ONLY');const permissions=await captureBrowserPermissions(database);await database.query('COMMIT');
 const filename='source-permissions-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sql';
 fs.writeFileSync(path.join(root,filename),'-- Fresh original source permissions; restore only before reopening source writes.\n'+permissions.sql,{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(root,'source-permissions-current.json'),JSON.stringify({filename,statements:permissions.statements,sha256:permissions.sha256,capturedAt:new Date().toISOString()}),{mode:0o600});
 console.log(JSON.stringify({readOnlySourceCapture:true,statements:permissions.statements,defaultFunctionAndColumnGrantsIncluded:true,productionPermissionsChanged:false}));
}finally{await database.end();}
