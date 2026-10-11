import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn().mockResolvedValue({rows:[]})}));
vi.mock('../../src/storage/db.js',()=>({query:mocks.query}));
vi.mock('../../src/config/index.js',()=>({env:{RAW_STORAGE_DRIVER:'supabase',SUPABASE_STORAGE_BUCKET:'scraper-raw'}}));
import {findUnextracted} from '../../src/storage/extractionsRepository.js';
it('requires archived bytes for private storage and applies retry backoff',async()=>{
  await findUnextracted(5);
  const [sql,params]=mocks.query.mock.calls[0]!;
  expect(params).toEqual([5,true,'scraper-raw']);
  expect(sql).toContain('FROM storage.objects');expect(sql).toContain("interval '1 hour'");
  expect(sql).toContain("(a.content_type ILIKE '%pdf%') DESC");
});
