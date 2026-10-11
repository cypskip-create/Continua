import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enqueue:vi.fn(), claim:vi.fn(), finish:vi.fn(), latest:vi.fn(), insert:vi.fn(), dead:vi.fn() }));
vi.mock('../../../src/storage/documentJobsRepository.js', () => ({ enqueueDocuments:mocks.enqueue, claimDocuments:mocks.claim, finishDocument:mocks.finish }));
vi.mock('../../../src/storage/extractionsRepository.js', () => ({ findLatestExtraction:mocks.latest, insertExtraction:mocks.insert }));
vi.mock('../../../src/storage/deadLettersRepository.js', () => ({ recordDeadLetter:mocks.dead }));
vi.mock('../../../src/monitoring/logger.js', () => ({ logger:{info:vi.fn(),warn:vi.fn()} }));
import { runAdapter } from '../../../src/adapters/runAdapter.js';
import type { SourceAdapter } from '../../../src/adapters/types.js';
const doc = { url:'https://www.nse.co.ke/report.pdf', discoveredFrom:'https://www.nse.co.ke/' };
const parsed = { method:'native_pdf_text' as const, confidence:.9, text:'A genuine company statement with dated financial figures and explicit KES units.', tables:[], entity:{ companyName:null,ticker:null,exchange:'NSE' }, needsReview:false };
beforeEach(() => { vi.resetAllMocks(); mocks.latest.mockResolvedValue(null); });
function adapter(): SourceAdapter {
  return { id:'nse', persistentBatchSize:2, documentConcurrency:1, discover:vi.fn().mockResolvedValue([]),
    fetch:vi.fn().mockResolvedValue({ document:doc, artifactId:7, isNewArtifact:false, contentType:'application/pdf' }),
    parse:vi.fn().mockResolvedValue(parsed) };
}
it('claims one report at a time and stops at the bounded queue budget',async()=>{
  const source=adapter();
  mocks.claim.mockResolvedValueOnce([{id:1,document:doc,attempts:2}]).mockResolvedValueOnce([{id:2,document:doc,attempts:1}]);
  const summary=await runAdapter(source);
  expect(summary.extracted).toBe(2);
  expect(mocks.claim.mock.calls).toEqual([['nse',1],['nse',1]]);
  expect(mocks.finish.mock.calls).toEqual([[1,2],[2,1]]);
  expect(mocks.finish.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[1]!);
});
it('automatically reparses a legacy empty extraction rather than skipping it',async()=>{
  mocks.claim.mockResolvedValueOnce([{id:1,document:doc,attempts:3}]).mockResolvedValueOnce([]);
  mocks.latest.mockResolvedValue({text:null});
  const source=adapter();
  expect((await runAdapter(source)).extracted).toBe(1);
  expect(source.parse).toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(1,3);
});
it('empty extraction remains failed/retryable even when failure auditing is unavailable',async()=>{
  mocks.claim.mockResolvedValueOnce([{id:1,document:doc,attempts:3}]).mockResolvedValueOnce([]);
  mocks.dead.mockRejectedValue(new Error('audit temporarily unavailable'));
  const source=adapter(); source.parse=vi.fn().mockResolvedValue({...parsed,text:null});
  expect((await runAdapter(source)).failed).toBe(1);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(1,3,expect.stringContaining('no usable text'));
});
it('keeps unchanged successfully extracted documents idempotent',async()=>{
  mocks.claim.mockResolvedValueOnce([{id:1,document:doc,attempts:1}]).mockResolvedValueOnce([]);
  mocks.latest.mockResolvedValue({text:parsed.text});
  const source=adapter(); await runAdapter(source);
  expect(source.parse).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
