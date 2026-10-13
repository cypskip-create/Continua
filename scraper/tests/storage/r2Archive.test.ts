import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>({query:vi.fn(),read:vi.fn(),write:vi.fn(),env:{RAW_STORAGE_DRIVER:'r2',R2_BUCKET:'private-documents'}}));
vi.mock('../../src/config/index.js',()=>({env:mocks.env}));
vi.mock('../../src/storage/db.js',()=>({query:mocks.query}));
vi.mock('../../src/storage/rawStorage.js',()=>({readRawArtifact:mocks.read}));
vi.mock('../../src/storage/r2Storage.js',()=>({safeObjectKey:(key:string)=>key,writeR2:mocks.write}));
vi.mock('../../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn()}}));
import {archiveToR2} from '../../src/storage/r2Archive.js';
const bytes=Buffer.from('%PDF-retained'),hash=createHash('sha256').update(bytes).digest('hex');
const row={id:7,source_id:'nse',storage_path:`nse/2026/${hash}.pdf`,sha256:hash,size_bytes:bytes.length,content_type:'application/pdf',document_url:'https://fixture.example/report.pdf',extraction_id:8,extraction_snapshot:{id:8,needs_review:true,text:'Unvalidated fixture'}};
beforeEach(()=>{vi.clearAllMocks();mocks.env.RAW_STORAGE_DRIVER='r2';mocks.query.mockResolvedValue({rows:[]});mocks.read.mockResolvedValue(bytes);mocks.write.mockResolvedValue(undefined);});
it('archives raw bytes and provenance JSON before updating the reference, retaining originals',async()=>{
 mocks.query.mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rows:[row.extraction_snapshot]}); expect(await archiveToR2()).toEqual({copied:1,failed:0});
 expect(mocks.write).toHaveBeenCalledTimes(2);expect(JSON.parse(mocks.write.mock.calls[1]![1].toString()).extraction.needs_review).toBe(true);
 const update=mocks.query.mock.calls[2]!;expect(update[0]).toContain('storage_path=$4');expect(update[1][1]).toMatch(/^r2:\/\/private-documents\//);expect(update[0]).not.toContain('DELETE');
});
it('failed verification never switches the original storage reference',async()=>{
 mocks.query.mockResolvedValueOnce({rows:[row]});mocks.write.mockRejectedValue(new Error('checksum mismatch'));
 expect(await archiveToR2()).toEqual({copied:0,failed:1});expect(mocks.query.mock.calls[1]![0]).not.toContain('SET storage_path');
});
it('the configured driver gate prevents unapproved writes and bounds batches',async()=>{
 mocks.env.RAW_STORAGE_DRIVER='supabase';expect((await archiveToR2()).disabled).toBe(true);expect(mocks.query).not.toHaveBeenCalled();
 mocks.env.RAW_STORAGE_DRIVER='r2';await expect(archiveToR2(21)).rejects.toThrow('1–20');
});
