import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn().mockResolvedValue({rows:[]})}));
vi.mock('../../src/storage/db.js',()=>({query:mocks.query}));
vi.mock('../../src/config/index.js',()=>({env:{RAW_STORAGE_DRIVER:'r2',R2_BUCKET:'private-documents'}}));
import {findUnextracted} from '../../src/storage/extractionsRepository.js';
import {requeueIncompleteDocuments} from '../../src/storage/documentJobsRepository.js';
it('restricts extraction to retained private R2 bytes and applies retry backoff',async()=>{
  await findUnextracted(5);
  const [sql,params]=mocks.query.mock.calls[0]!;
  expect(params).toEqual([5,'r2://private-documents/%']);
  expect(sql).not.toContain('storage.objects');expect(sql).toContain("interval '1 hour'");
  expect(sql).toContain("(a.content_type ILIKE '%pdf%') DESC");
  expect(sql).toContain('ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1');
  expect(sql).toContain("length(trim(coalesce(e.text,'')))<50");
});
it('recovers only the newest failed PDF result, leaving valid and active jobs alone',async()=>{
  await requeueIncompleteDocuments('nse',10);
  const [sql,params]=mocks.query.mock.calls.at(-1)!;
  expect(params).toEqual(['nse',10]);
  expect(sql).toContain("j.status='complete'");
  expect(sql).toContain('ORDER BY a.retrieved_at DESC,a.id DESC LIMIT 1');
  expect(sql).toContain('ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1');
  expect(sql).toContain('FOR UPDATE SKIP LOCKED LIMIT $2');
});
