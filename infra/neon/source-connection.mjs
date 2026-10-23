import fs from 'node:fs';import tls from 'node:tls';import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
export function existingSourceConnection(){
 const url=new URL(dotenv.parse(fs.readFileSync('backend/.env.local')).DATABASE_URL);
 if(!(url.hostname==='db.jjsetogmnumoudrovpzn.supabase.co'||url.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(url.username)==='postgres.jjsetogmnumoudrovpzn'))throw Error('Source is not the existing Continua project');
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 const ca=[...tls.rootCertificates,fs.readFileSync('scraper-python/continua_scraper/supabase-root-2021.crt','utf8')];
 return {url,ca};
}
