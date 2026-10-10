import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ env: { RAW_STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-not-real", SUPABASE_STORAGE_BUCKET: "scraper-raw", MAX_RESPONSE_SIZE_BYTES: 10000 } }));
import { storeRawArtifact, readRawArtifact } from "../../src/storage/rawStorage.js";
const request = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", request); request.mockReset(); });
it("uploads and reads private immutable artifact bytes without exposing a public URL", async () => {
  request.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response("pdf-bytes"));
  const key = await storeRawArtifact({ sourceId: "nse", sha256: "hash", contentType: "application/pdf", body: Buffer.from("pdf-bytes") });
  expect(request.mock.calls[0]?.[0]).toMatch(/^https:\/\/fixture.supabase.co\/storage\/v1\/object\/scraper-raw\/nse\//);
  expect((await readRawArtifact(key)).toString()).toBe("pdf-bytes");
});
it("rejects traversal and fails clearly on an upload failure", async () => {
  await expect(readRawArtifact("../private")).rejects.toThrow("Invalid artifact key");
  request.mockResolvedValue(new Response(null, { status: 403 }));
  await expect(storeRawArtifact({ sourceId: "nse", sha256: "hash", contentType: "application/pdf", body: Buffer.from("pdf") })).rejects.toThrow("HTTP 403");
});
