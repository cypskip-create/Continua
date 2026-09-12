/**
 * Writes downloaded bytes to disk under RAW_STORAGE_LOCAL_PATH, laid out
 * by source/date/hash (§23 — raw artifacts are immutable, organized so
 * they can be reprocessed later without re-downloading). This is the
 * ONLY storage driver implemented right now; RAW_STORAGE_DRIVER=supabase
 * is validated by env.ts but not wired up yet — swap this module out
 * when artifact volume outgrows a single instance's disk, or once the
 * host's disk stops being persistent across deploys (true today on
 * Render's free web service tier — see the RAW_STORAGE_DRIVER comment
 * in config/env.ts).
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
  if (env.RAW_STORAGE_DRIVER !== "local") {
    throw new Error(`RAW_STORAGE_DRIVER=${env.RAW_STORAGE_DRIVER} is not implemented yet — only 'local' is wired up`);
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const ext = extensionFor(params.contentType);
  const relativePath = path.join(params.sourceId, String(year), `${params.sha256}.${ext}`);
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
  if (env.RAW_STORAGE_DRIVER !== "local") {
    throw new Error(`RAW_STORAGE_DRIVER=${env.RAW_STORAGE_DRIVER} is not implemented yet — only 'local' is wired up`);
  }
  const fullPath = path.join(env.RAW_STORAGE_LOCAL_PATH, storagePath);
  return readFile(fullPath);
}