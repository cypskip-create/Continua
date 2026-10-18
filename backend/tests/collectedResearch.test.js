import { expect, it, vi,afterEach } from 'vitest';
vi.mock('../src/storage/db.js', () => ({ query: vi.fn() }));
import { query } from '../src/storage/db.js';
import { collectedResearch } from '../src/services/research/collectedResearch.js';
import {processedObjectRepository} from '../src/storage/researchObjects.js';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

it('hydrates prepared objects only after the current source rights query and never masks corrupt cloud data',async()=>{
    vi.stubEnv('PROCESSED_STORAGE_READS','r2');
    const row={payload:{stale:true},object_uri:'private-receipt'};
    query.mockResolvedValue({rows:[row]});
    const reader=vi.spyOn(processedObjectRepository,'read').mockResolvedValue({revenue:123.45});
    expect(await collectedResearch('KCB')).toEqual([{revenue:123.45}]);
    expect(query.mock.calls.at(-1)[0]).toContain('c.processed_at=p.processed_at');
    expect(query.mock.calls.at(-1)[0]).toContain('s.redistribution_allowed=true');
    reader.mockRejectedValue(new Error('integrity mismatch'));
    await expect(collectedResearch('KCB')).rejects.toThrow('integrity');
});

it('strict cloud reads do not silently return the temporary database projection',async()=>{
    vi.stubEnv('PROCESSED_STORAGE_READS','r2');
    query.mockResolvedValue({rows:[{payload:{stale:true}}]});
    await expect(collectedResearch('KCB')).rejects.toThrow('cloud object is pending');
});

it('reads processed issuer data with current rights, private evidence and latest-category guards', async () => {
    const observation = { destination: 'financials', status: 'publisher_observation', charts: [] };
    query.mockResolvedValue({ rows: [{ payload: observation }] });
    expect(await collectedResearch('COOP')).toEqual([observation]);
    const [sql, args] = query.mock.calls.at(-1);
    expect(args).toEqual(['NSE:COOP',20,0]);
    for (const guard of ['DISTINCT ON', 's.enabled', 's.redistribution_allowed=true', 'permissionReference',
        'r2://continua-financial-documents/', 'processor_version', "p.destination<>'review'", 'LIMIT $2 OFFSET $3']) expect(sql).toContain(guard);
});
it('supports bounded paging without dropping older document records',async()=>{
    query.mockResolvedValue({rows:[]});
    await collectedResearch('COOP',10,100);
    expect(query.mock.calls.at(-1)[1]).toEqual(['NSE:COOP',10,100]);
    await expect(collectedResearch('COOP',101)).rejects.toThrow('Invalid collected research page');
});
it('rejects unsafe symbols without querying', async () => {
    query.mockClear();
    expect(await collectedResearch("COOP' OR true")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
});
it('filters research destinations before pagination without loading PDFs or history',async()=>{
    query.mockResolvedValue({rows:[]});await collectedResearch('COOP',20,0,['financials','ownership']);
    expect(query.mock.calls.at(-1)[0]).toContain('p.destination=ANY($4::text[])');
    expect(query.mock.calls.at(-1)[1]).toEqual(['NSE:COOP',20,0,['financials','ownership']]);
    await expect(collectedResearch('COOP',20,0,["financials' OR true"])).rejects.toThrow('Invalid research destinations');
});
