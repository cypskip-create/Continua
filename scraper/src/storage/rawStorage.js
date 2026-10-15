/**
 * Writes downloaded bytes to disk under RAW_STORAGE_LOCAL_PATH, laid out
 * by source/date/hash (§23 — raw artifacts are immutable, organized so
 * they can be reprocessed later without re-downloading). This is the
 * Local and private Supabase Storage drivers are supported. Use private
 * object storage for history that must survive service deploys/restarts.
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
        if(!env.R2_DUAL_WRITE&&['html','json','csv','xml'].includes(ext)&&params.body.length>=4096){
            if(params.body.length>env.MAX_RESPONSE_SIZE_BYTES||createHash('sha256').update(params.body).digest('hex')!==params.sha256)throw new Error('Invalid source evidence');
            const encoded=gzipSync(params.body,{level:6});
            if(encoded.length<params.body.length){storedBody=encoded;storedHash=createHash('sha256').update(encoded).digest('hex');encoding='gzip';objectKey=safeObjectKey(`${params.sourceId}/${year}/${storedHash}.${ext}.gz`);}
        }
        await writeR2(objectKey, storedBody, storedHash, params.contentType,encoding);
        if (env.R2_DUAL_WRITE) {
            const response = await fetch(storageUrl(objectKey), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { ...storageHeaders(), 'Content-Type': params.contentType ?? 'application/octet-stream', 'x-upsert': 'true' }, body: new Uint8Array(params.body) });
            if (!response.ok)
                throw new Error(`Rollback storage copy failed: HTTP ${response.status}`);
        }
        return `r2://${env.R2_BUCKET}/${objectKey}`;
    }
    if (env.RAW_STORAGE_DRIVER === "supabase") {
        const objectKey = relativePath.replaceAll("\\", "/");
        const response = await fetch(storageUrl(objectKey), { method: "POST", redirect: "error",
            signal: AbortSignal.timeout(60_000), headers: { ...storageHeaders(), "Content-Type": params.contentType ?? "application/octet-stream", "x-upsert": "true" }, body: new Uint8Array(params.body) });
        if (!response.ok)
            throw new Error(`Private artifact upload failed: HTTP ${response.status}`);
        return objectKey;
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
        if (env.RAW_STORAGE_DRIVER === 'r2') {
            const bytes=await readR2(key);
            return key.split('/').length===3&&/\.(?:html|json|csv|xml)\.gz$/.test(key)?gunzipSync(bytes,{maxOutputLength:env.MAX_RESPONSE_SIZE_BYTES}):bytes;
        }
        storagePath = key; // Dual-written rollback copy; original data is retained.
    }
    safeObjectKey(storagePath.replaceAll('\\', '/'));
    if (env.RAW_STORAGE_DRIVER === "supabase" || env.RAW_STORAGE_DRIVER === 'r2') {
        const response = await fetch(storageUrl(storagePath), { headers: storageHeaders(), redirect: "error", signal: AbortSignal.timeout(60_000) });
        if (!response.ok)
            throw new Error(`Private artifact read failed: HTTP ${response.status}`);
        const declared = Number(response.headers.get('content-length'));
        if (declared > env.MAX_RESPONSE_SIZE_BYTES || !response.body) {
            await response.body?.cancel();
            throw new Error('Stored artifact exceeds response limit');
        }
        const reader = response.body.getReader(), chunks = [];
        let length = 0;
        try {
            for (;;) {
                const {done, value} = await reader.read();
                if (done) break;
                length += value.byteLength;
                if (length > env.MAX_RESPONSE_SIZE_BYTES) throw new Error('Stored artifact exceeds response limit');
                chunks.push(Buffer.from(value));
            }
            return Buffer.concat(chunks, length);
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    const fullPath = path.join(env.RAW_STORAGE_LOCAL_PATH, storagePath);
    return readFile(fullPath);
}
function storageHeaders() {
    if (!env.SUPABASE_SERVICE_ROLE_KEY)
        throw new Error("Private artifact storage requires a server-side service key");
    return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
}
function storageUrl(key) {
    if (!env.SUPABASE_URL)
        throw new Error("Private artifact storage requires SUPABASE_URL");
    const base = new URL(env.SUPABASE_URL);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
        throw new Error("Invalid storage URL");
    const parts = key.replaceAll("\\", "/").split("/");
    if (parts.some(part => !part || part === "." || part === ".."))
        throw new Error("Invalid artifact key");
    return `${base.origin}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${parts.map(encodeURIComponent).join("/")}`;
}
