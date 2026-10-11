import {it,expect,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({query:vi.fn()}));
import {query} from '../src/storage/db.js';
import {publisherProfile} from '../src/services/research/publisherProfile.js';
it('accepts attributed exact group contact facts, rejects subsidiary identity',async()=>{
 vi.mocked(query).mockResolvedValue({rows:[{tables:[{kind:'publisher_profile',companyName:'KCB Group Plc',facts:{address:'Nairobi',website:'kcbgroup.com'}}],document_url:'https://afx.kwayisi.org/nse/kcb.html',retrieved_at:'2026-10-11'}]} as any);
 expect((await publisherProfile('KCB','KCB Group'))?.sourceUrl).toContain('/kcb.html');
 expect(await publisherProfile('KCB','KCB Bank Burundi')).toBeNull();
});
