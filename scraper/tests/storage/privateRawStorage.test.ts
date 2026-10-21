import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ env: { RAW_STORAGE_DRIVER: "supabase", MAX_RESPONSE_SIZE_BYTES: 10000 } }));
import { storeRawArtifact, readRawArtifact } from "../../src/storage/rawStorage.js";
const request = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", request); request.mockReset(); });
it("blocks obsolete Supabase writes before transmitting private artifact bytes", async () => {
 await expect(storeRawArtifact({ sourceId:"nse", sha256:"hash", contentType:"application/pdf", body:Buffer.from("fixture") })).rejects.toThrow("Supabase file writes are disabled");
 expect(request).not.toHaveBeenCalled();
});
it("rejects traversal before reading private artifacts", async () => {
 await expect(readRawArtifact("../private")).rejects.toThrow("Invalid artifact key");
 expect(request).not.toHaveBeenCalled();
});
