import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ publish:vi.fn(), schedule:vi.fn(), error:vi.fn() }));
vi.mock('../src/ingestion/pipelines/automaticDocumentPublication.js',()=>({ runAutomaticDocumentPublication:mocks.publish }));
vi.mock('node-cron',()=>({ default:{ schedule:mocks.schedule } }));
vi.mock('../src/monitoring/logger.js',()=>({ logger:{info:vi.fn(),error:mocks.error} }));
vi.mock('../src/config/index.js',()=>({env:{ DOCUMENT_PUBLICATION_CRON:'*/2 * * * *',DOCUMENT_PUBLICATION_BATCH_SIZE:25 }}));
import { runDocumentPublicationOnce, startDocumentPublicationWorker } from '../src/workers/documentPublicationWorker.js';
beforeEach(()=>vi.resetAllMocks());
it('starts automatic validation at boot and schedules it independently',async()=>{
  const task={stop:vi.fn()}; mocks.schedule.mockReturnValue(task); mocks.publish.mockResolvedValue({published:0});
  expect(startDocumentPublicationWorker()).toBe(task);
  expect(mocks.publish).toHaveBeenCalledWith(25);
  expect(mocks.schedule).toHaveBeenCalledWith('*/2 * * * *',expect.any(Function));
  mocks.schedule.mock.calls[0]![1]();
  expect(mocks.publish).toHaveBeenCalledTimes(2);
});
it('contains infrastructure failures so a later tick can retry',async()=>{
  mocks.publish.mockRejectedValue(new Error('database temporarily unavailable'));
  await expect(runDocumentPublicationOnce()).resolves.toBeUndefined();
  expect(mocks.error).toHaveBeenCalled();
});
