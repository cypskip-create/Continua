import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lightRouteAllowed,lightSlotId,runLightScope,reserveLightRequest} from '../src/scheduler/renderLight.js';
test('light role rejects every bulk route including public refresh and admin execution',()=>{
    for(const [method,path] of [['POST','/documents/refresh'],['POST','/news/refresh'],['POST','/extractions/sweep'],['POST','/sources/nse/crawl'],['GET','/adapters/nse/announcements/preview']])
        assert.equal(lightRouteAllowed(method,path),false);
    assert.equal(lightRouteAllowed('POST','/indices/refresh'),true);
    assert.equal(lightRouteAllowed('GET','/health/live'),true);
});
test('light source quota rejects calls outside the bounded job and limits all attempts',async()=>{
    assert.throws(reserveLightRequest);
    await runLightScope(async()=>{
        for(let i=0;i<4;i++){await Promise.resolve();reserveLightRequest();}
        assert.throws(reserveLightRequest);
    });
    assert.throws(reserveLightRequest);
});
test('six-hour SQL id is stable across restarts and changes only at slot boundary',()=>{
    assert.equal(lightSlotId(0),lightSlotId(6*60*60_000-1));
    assert.notEqual(lightSlotId(0),lightSlotId(6*60*60_000));
});
