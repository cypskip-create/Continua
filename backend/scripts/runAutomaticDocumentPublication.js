import { runAutomaticDocumentPublication } from '../src/ingestion/pipelines/automaticDocumentPublication.js';
import { pool } from '../src/storage/db.js';
try {
    const target = process.argv.find(arg => arg.startsWith('--extraction='))?.split('=')[1];
    const ids = target?.split(',').map(Number);
    if (ids?.some(id => !Number.isSafeInteger(id) || id <= 0) || (ids?.length ?? 0) > 100)
        throw new Error('Invalid extraction IDs');
    console.log(JSON.stringify(await runAutomaticDocumentPublication(Number(process.argv[2]) || 25, ids)));
}
catch {
    console.error('Automatic publication failed; existing records retained.');
    process.exitCode = 1;
}
finally {
    await pool.end();
}
