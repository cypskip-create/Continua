import {expect,it,vi} from 'vitest';
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query}));
import {claimDocuments} from '../src/storage/documentJobsRepository.js';
it('prioritizes issuer report discovery and PDFs without dropping other tabs or lease safety',async()=>{
 query.mockResolvedValue({rows:[]});await claimDocuments('kenyanstocks',10);
 const [sql,params]=query.mock.calls[0]!;
 expect(sql).toContain("->>'tab'='Files' THEN 1");expect(sql).toContain("->>'tab'='Financials' THEN 2");expect(sql).toContain('FOR UPDATE SKIP LOCKED');expect(sql).toContain("lease_until < now()");expect(params).toEqual(['kenyanstocks',10]);
});
