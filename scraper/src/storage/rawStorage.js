/**
 * Writes downloaded bytes to disk under RAW_STORAGE_LOCAL_PATH, laid out
 * by source/date/hash (§23 — raw artifacts are immutable, organized so
 * they can be reprocessed later without re-downloading). This is the
 * Production writes and reads use private R2. Legacy Supabase copies are read
 * only by the separately budgeted migration operator, never this runtime.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { env } from "../config/index.js";
import { safeObjectKey, readR2, writeR2 } from './r2Storage.js';
import { assertDurableStorage } from './storagePolicy.js';
function extensionFor(contentType) {
    if (!contentType)
        return "bin";
    const base = contentType.split(";")[0]?.trim();
    const map = {
        "application/pdf": "pdf",
        "text/html": "html",
        "application/json": "json",
        "text/csv": "csv",
        "application/xml": "xml",
        "text/xml": "xml",
        "image/png": "png",
        "image/jpeg": "jpg",
        "application/zip": "zip",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    };
    return map[base ?? ""] ?? "bin";
}
export async function storeRawArtifact(params) {
    assertDurableStorage(process.env, env.RAW_STORAGE_DRIVER);
    const now = new Date();
    const year = now.getUTCFullYear();
    const ext = extensionFor(params.contentType);
    const relativePath = path.join(params.sourceId, String(year), `${params.sha256}.${ext}`);
    if (env.RAW_STORAGE_DRIVER === 'r2') {
        let objectKey = safeObjectKey(relativePath.replaceAll('\\', '/'));
        let storedBody=params.body,storedHash=params.sha256,encoding;
        if(['html','json','csv','xml'].includes(ext)&&params.body.length>=4096){
            if(params.body.length>env.MAX_RESPONSE_SIZE_BYTES||createHash('sha256').update(params.body).digest('hex')!==params.sha256)throw new Error('Invalid source evidence');
            const encoded=gzipSync(params.body,{level:6});
            if(encoded.length<params.body.length){storedBody=encoded;storedHash=createHash('sha256').update(encoded).digest('hex');encoding='gzip';objectKey=safeObjectKey(`${params.sourceId}/${year}/${storedHash}.${ext}.gz`);}
        }
        await writeR2(objectKey, storedBody, storedHash, params.contentType,encoding);
        return `r2://${env.R2_BUCKET}/${objectKey}`;
    }
    const fullPath = path.join(env.RAW_STORAGE_LOCAL_PATH, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.body);
    // storage_path stored in the DB is relative — portable if the base path
    // or driver changes later.
    return relativePath;
}
/**
 * Reads a previously-stored artifact back off disk (§45 — reprocessing
 * must never require re-downloading a document that's already stored).
 * storagePath is the relative path as stored in raw_artifacts.storage_path.
 */
export async function readRawArtifact(storagePath) {
    if (storagePath.startsWith('r2://')) {
        const location = new URL(storagePath);
        if (location.hostname !== env.R2_BUCKET || location.search || location.hash)
            throw new Error('Invalid R2 artifact location');
        const key = safeObjectKey(location.pathname.slice(1));
        const bytes=await readR2(key);
        return key.split('/').length===3&&/\.(?:html|json|csv|xml)\.gz$/.test(key)?gunzipSync(bytes,{maxOutputLength:env.MAX_RESPONSE_SIZE_BYTES}):bytes;
    }
    safeObjectKey(storagePath.replaceAll('\\', '/'));
    if (env.RAW_STORAGE_DRIVER !== 'local') throw new Error('Legacy source awaits the separate verified R2 migration');
    const fullPath = path.join(env.RAW_STORAGE_LOCAL_PATH, storagePath);
    return readFile(fullPath);
}
