import {it,expect,vi} from 'vitest';
vi.mock('../src/config/index.js',()=>({env:{NODE_ENV:'production'}}));
vi.mock('../src/storage/db.js',()=>({query:vi.fn().mockResolvedValue({rows:[]}),pool:{connect:vi.fn()}}));
import {query} from '../src/storage/db.js';
import {candlesRepository} from '../src/storage/repositories/candlesRepository.js';
it('filters untraceable production candles in history, range, sparklines and volume',async()=>{
 await candlesRepository.getCandles('NSE:KCB','1d','2026-01-01','2026-10-09');
 await candlesRepository.getPriceAt('NSE:KCB','2026-10-09');
 await candlesRepository.getHighLow('NSE:KCB','2026-01-01','2026-10-09');
 await candlesRepository.getRecentClosesBatch(['NSE:KCB'],20);
 await candlesRepository.getAverageVolume('NSE:KCB','2026-01-01','2026-10-09');
 for(const [sql,params] of vi.mocked(query).mock.calls){expect(sql).toContain('source_url IS NOT NULL');expect(params?.at(-1)).toBe(false);}
});
