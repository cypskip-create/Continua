import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({find:vi.fn(),insert:vi.fn(),read:vi.fn(),extract:vi.fn(),dead:vi.fn()}));
vi.mock('../../src/storage/extractionsRepository.js',()=>({findUnextracted:mocks.find,insertExtraction:mocks.insert}));
vi.mock('../../src/storage/rawStorage.js',()=>({readRawArtifact:mocks.read}));
vi.mock('../../src/storage/deadLettersRepository.js',()=>({recordDeadLetter:mocks.dead}));
vi.mock('../../src/extraction/extractByContentType.js',()=>({extractByContentType:mocks.extract}));
vi.mock('../../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn()}}));
import {sweepUnextractedArtifacts} from '../../src/extraction/extractionSweep.js';
const artifact={artifactId:1,sourceId:'nse-market-reports',documentUrl:'https://www.nse.co.ke/report.pdf',contentType:'application/pdf',storagePath:'report.pdf'};
beforeEach(()=>{vi.resetAllMocks();mocks.find.mockResolvedValue([artifact]);mocks.read.mockResolvedValue(Buffer.from('pdf'));mocks.extract.mockResolvedValue({method:'native_pdf_text',confidence:0.8,text:'source',tables:[],needsReview:true});});
it('coalesces overlapping cron and manual sweeps without publishing unreviewed data',async()=>{
  const a=sweepUnextractedArtifacts(1),b=sweepUnextractedArtifacts(1);
  expect(a).toBe(b);expect(await a).toMatchObject({extracted:1,needsReview:1});
  expect(mocks.find).toHaveBeenCalledTimes(1);expect(mocks.insert).toHaveBeenCalledTimes(1);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({needsReview:true}));
});
it('continues after a missing file and releases a completed sweep',async()=>{
  mocks.find.mockResolvedValue([artifact,{...artifact,artifactId:2}]);
  mocks.read.mockRejectedValueOnce(new Error('missing archive'));
  expect(await sweepUnextractedArtifacts(2)).toMatchObject({failed:1,extracted:1});
  expect(mocks.dead).toHaveBeenCalledTimes(1);
  await sweepUnextractedArtifacts(1);expect(mocks.find).toHaveBeenCalledTimes(2);
});
it('rejects unbounded batches',async()=>{await expect(sweepUnextractedArtifacts(1000)).rejects.toThrow('1–100');expect(mocks.find).not.toHaveBeenCalled();});
