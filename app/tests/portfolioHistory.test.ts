import test from 'node:test';import assert from 'node:assert/strict';
import {portfolioValueHistory} from '../src/lib/portfolioHistory.js';
test('portfolio history weights real closes by the actual share quantities',()=>{
 const points=portfolioValueHistory([{symbol:'A',shares:2},{symbol:'B',shares:3}],{A:[{timestamp:'2026-10-01',close:10},{timestamp:'2026-10-02',close:12}],B:[{timestamp:'2026-10-01',close:20},{timestamp:'2026-10-02',close:21}]});
 assert.deepEqual(points.map(point=>point.value),[80,87]);
});
test('missing, stale or invalid holding prices never become zero-valued portfolio history',()=>{
 const holdings=[{symbol:'A',shares:2},{symbol:'B',shares:3}];
 assert.equal(portfolioValueHistory(holdings,{A:[{timestamp:'2026-10-01',close:10}]}).length,0);
 const points=portfolioValueHistory(holdings,{A:[{timestamp:'2026-10-01',close:10},{timestamp:'2026-10-12',close:12}],B:[{timestamp:'2026-10-01',close:20}]});assert.equal(points.length,1);
 assert.equal(portfolioValueHistory([{symbol:'A',shares:NaN}],{A:[{timestamp:'2026-10-01',close:10}]}).length,0);
});
