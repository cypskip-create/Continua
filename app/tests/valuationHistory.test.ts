import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyValuationCloses} from '../src/lib/valuationHistory.ts';
test('valuation charts use one chronological closing point per day, not every intraday observation',()=>{
 const data=dailyValuationCloses([{timestamp:'2025-01-02T08:00:00Z',close:10},{timestamp:'2025-01-01T12:00:00Z',close:9},{timestamp:'2025-01-02T12:00:00Z',close:11},{timestamp:'invalid',close:3},{timestamp:'2025-01-03T12:00:00Z',close:0}]);
 assert.deepEqual(data.map(p=>p.close),[9,11]);
});
