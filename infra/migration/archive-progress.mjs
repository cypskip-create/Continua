/** Read-only aggregate verification against the already-configured owned DB.
 * Never prints credentials, document contents or individual account records.
 */
import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../backend/.env.local',import.meta.url)),quiet:true});
const connection=process.env.DATABASE_URL;
if(!connection)throw new Error('Configured database connection not available');
const url=new URL(connection);
if(!url.username.includes('jjsetogmnumoudrovpzn')&&!url.hostname.includes('jjsetogmnumoudrovpzn'))
    throw new Error('Owned production database connection not available');
const pool=new pg.Pool({connectionString:connection,connectionTimeoutMillis:10000,statement_timeout:15000,max:1});
try {
    const {rows}=await pool.query(`SELECT count(*)::int AS raw_artifacts,
      count(*) FILTER (WHERE storage_path LIKE 'r2://%')::int AS raw_in_r2,
      count(*) FILTER (WHERE storage_path LIKE 'r2://%' AND content_type LIKE '%pdf%')::int AS pdfs_in_r2,
      count(*) FILTER (WHERE metadata->>'r2ExtractionId' IS NOT NULL)::int AS artifacts_with_archived_extractions
      FROM scraping.raw_artifacts`);
    console.log(JSON.stringify(rows[0]));
} finally {await pool.end();}
