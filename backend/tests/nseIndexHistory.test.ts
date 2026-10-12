import {vi,it,expect,beforeEach} from 'vitest';
const db=vi.hoisted(()=>vi.fn());vi.mock('../src/storage/db.js',()=>({query:db}));
import {publishNseIndexHistory} from '../src/ingestion/pipelines/nseIndexHistory.js';
import {normalizeNseIndices} from '../src/adapters/nse/nseIndices.js';
beforeEach(()=>db.mockReset());
it('requires an enabled permitted source before extending statistics history',async()=>{
 db.mockResolvedValue({rows:[{enabled:false,permission_reference:'fixture'}]});await publishNseIndexHistory([]);expect(db).toHaveBeenCalledTimes(1);
});
it('retains publisher date, points and permission evidence',async()=>{
 db.mockResolvedValueOnce({rows:[{enabled:true,permission_reference:'fixture-approval'}]}).mockResolvedValue({rows:[]});
 await publishNseIndexHistory(normalizeNseIndices([{kind:'nse_index',code:'NASI',value:101,change:1,asOf:'2026-10-09'}]));
 const args=db.mock.calls[1]![1];expect(args[0]).toBe('nse-index:NASI:2026-10-09');expect(args[4]).toBe('2026-10-09T00:00:00.000Z');
 expect(JSON.parse(args[6])).toMatchObject({actual:101,previous:100,change:1,unit:'points',permissionReference:'fixture-approval'});
});
