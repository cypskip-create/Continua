import {test} from 'vitest';
import assert from 'node:assert/strict';
import {publisherCandleQuery,mergeDailyObservations} from '../src/storage/repositories/publisherCandleQuery.js';
test('durable daily observations fill missing dates without replacing canonical prices',()=>{
 const canonical=[{timestamp:'2026-10-16T12:00:00Z',close:20}];
 const rows=mergeDailyObservations(canonical,[{timestamp:'2026-10-16T00:00:00Z',close:19},{timestamp:'2026-10-15T00:00:00Z',close:18}]);
 assert.deepEqual(rows.map(r=>r.close),[18,20]);
 assert.match(publisherCandleQuery,/redistribution_allowed=true/);
 assert.match(publisherCandleQuery,/r2:\/\/continua-financial-documents/);
 assert.match(publisherCandleQuery,/'unknown'::text AS adjustment/);
 assert.match(publisherCandleQuery,/p.security_id=\$1/);
});
