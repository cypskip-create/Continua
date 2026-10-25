import {test,expect} from 'vitest';import {handleError,normalizeUserHandle} from './handlePolicy.js';import {compileDataRequest} from './browserData.js';
test('handle policy enforces boundaries, ASCII spelling and reserved identities',()=>{
 for(const value of ['cypskip','trader_254','a123','user_1234567890'])expect(handleError(value)).toBeNull();
 for(const value of ['abc','a'.repeat(16),'____','a-bc','a.bc','a bc','аbcd','support','official','siteadmin','continua_team','Trader','@trader'])expect(handleError(value)).toBeTruthy();
 expect(normalizeUserHandle(' @Trader_254 ')).toBe('trader_254');
});
test('server rejects malformed profile handles rather than silently changing their meaning',()=>{
 const compile=handle=>compileDataRequest({table:'profiles',method:'PATCH',search:new URLSearchParams({user_id:'eq.owner'}),body:{handle}});
 expect(compile('@Trader_254').params).toContain('trader_254');for(const value of [null,'','bad-name','admin','a'.repeat(16)])expect(()=>compile(value)).toThrow();
});
