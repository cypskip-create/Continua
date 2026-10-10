/**
 * Writes downloaded bytes to disk under RAW_STORAGE_LOCAL_PATH, laid out
 * by source/date/hash (§23 — raw artifacts are immutable, organized so
 * they can be reprocessed later without re-downloading). This is the
 * Local and private Supabase Storage drivers are supported. Use private
 * object storage for history that must survive service deploys/restarts.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/index.js";

function extensionFor(contentType: string | null): string {
  if (!contentType) return "bin";
  const base = contentType.split(";")[0]?.trim();
  const map: Record<string, string> = {
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

export async function storeRawArtifact(params: {
  sourceId: string;
  sha256: string;
  contentType: string | null;
  body: Buffer;
}): Promise<string> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const ext = extensionFor(params.contentType);
  const relativePath = path.join(params.sourceId, String(year), `${params.sha256}.${ext}`);
  if (env.RAW_STORAGE_DRIVER === "supabase") {
    const objectKey = relativePath.replaceAll("\\", "/");
    const response = await fetch(storageUrl(objectKey), { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(60_000), headers: { ...storageHeaders(), "Content-Type": params.contentType ?? "application/octet-stream", "x-upsert": "true" }, body: new Uint8Array(params.body) });
    if (!response.ok) throw new Error(`Private artifact upload failed: HTTP ${response.status}`);
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
export async function readRawArtifact(storagePath: string): Promise<Buffer> {
  if (env.RAW_STORAGE_DRIVER === "supabase") {
    const response = await fetch(storageUrl(storagePath), { headers: storageHeaders(), redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Private artifact read failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > env.MAX_RESPONSE_SIZE_BYTES) throw new Error("Stored artifact exceeds response limit");
    return bytes;
  }
  const fullPath = path.join(env.RAW_STORAGE_LOCAL_PATH, storagePath);
  return readFile(fullPath);
}

function storageHeaders(): Record<string,string> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Private artifact storage requires a server-side service key");
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
}
function storageUrl(key: string): string {
  if (!env.SUPABASE_URL) throw new Error("Private artifact storage requires SUPABASE_URL");
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Invalid storage URL");
  const parts = key.replaceAll("\\", "/").split("/");
  if (parts.some(part => !part || part === "." || part === "..")) throw new Error("Invalid artifact key");
  return `${base.origin}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${parts.map(encodeURIComponent).join("/")}`;
}
