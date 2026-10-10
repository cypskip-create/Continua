import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../src/storage/extractionsRepository.js", () => ({ insertExtraction: vi.fn(), findLatestExtraction: vi.fn() }));
vi.mock("../../../src/storage/documentJobsRepository.js", () => ({ enqueueDocuments: vi.fn(), claimDocuments: vi.fn(), finishDocument: vi.fn() }));
vi.mock("../../../src/storage/deadLettersRepository.js", () => ({ recordDeadLetter: vi.fn() }));
vi.mock("../../../src/monitoring/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { runAdapter } from "../../../src/adapters/runAdapter.js";
import { insertExtraction, findLatestExtraction } from "../../../src/storage/extractionsRepository.js";
import { claimDocuments, finishDocument } from "../../../src/storage/documentJobsRepository.js";
import type { SourceAdapter } from "../../../src/adapters/types.js";
const doc = { url: "https://www.nse.co.ke/report.pdf", discoveredFrom: "https://www.nse.co.ke/" };
const adapter: SourceAdapter = { id: "nse", persistentBatchSize: 25, discover: async () => [doc],
  fetch: async () => ({ document: doc, artifactId: 7, isNewArtifact: false, body: Buffer.from("pdf"), sha256: "hash", contentType: "application/pdf", sizeBytes: 3, storagePath: "file.pdf" }),
  parse: vi.fn(async () => ({ method: "native_pdf_text" as const, confidence: .9, text: "reported figures", tables: [], entity: { companyName: null, ticker: null, exchange: "NSE" }, needsReview: false })) };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(claimDocuments).mockResolvedValue([{ id: 3, document: doc, attempts: 2 }]); });
it("retries extraction when bytes were stored before a crash", async () => {
  vi.mocked(findLatestExtraction).mockResolvedValue(null);
  expect((await runAdapter(adapter)).extracted).toBe(1);
  expect(insertExtraction).toHaveBeenCalled();
  expect(finishDocument).toHaveBeenCalledWith(3,2);
});
it("does not parse a successfully extracted unchanged PDF twice", async () => {
  vi.mocked(findLatestExtraction).mockResolvedValue({ id: 1 } as never);
  expect((await runAdapter(adapter)).extracted).toBe(0);
  expect(adapter.parse).not.toHaveBeenCalled();
  expect(finishDocument).toHaveBeenCalledWith(3,2);
});
it("drains previously queued work even when discovery returns no new documents", async () => {
  vi.mocked(findLatestExtraction).mockResolvedValue(null);
  const result = await runAdapter({ ...adapter, discover: async () => [] });
  expect(result.discovered).toBe(0);
  expect(result.fetched).toBe(1);
  expect(result.extracted).toBe(1);
  expect(finishDocument).toHaveBeenCalledWith(3, 2);
});
it("completes download-only jobs instead of leaving their leases active", async () => {
  vi.mocked(findLatestExtraction).mockResolvedValue(null);
  expect((await runAdapter({ ...adapter, parse: undefined })).fetched).toBe(1);
  expect(finishDocument).toHaveBeenCalledWith(3, 2);
});
