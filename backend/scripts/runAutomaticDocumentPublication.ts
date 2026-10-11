import { runAutomaticDocumentPublication } from '../src/ingestion/pipelines/automaticDocumentPublication.js';
import { pool } from '../src/storage/db.js';
try { console.log(JSON.stringify(await runAutomaticDocumentPublication(Number(process.argv[2])||25))); }
catch { console.error('Automatic publication failed; existing records retained.');process.exitCode=1; }
finally { await pool.end(); }
