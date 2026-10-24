import test from 'node:test';
import assert from 'node:assert/strict';
import {rollingDigits, rollingDirection} from '../src/lib/rollingNumber.ts';
test('rolling values preserve signs and direction through currency formatting',()=>{
  assert.equal(rollingDirection('KES 1,000.00','KES 999.99'),'down');
  assert.equal(rollingDirection('−KES 100.00','−KES 110.00'),'down');
  assert.equal(rollingDirection('-1.00%','+1.00%'),'up');
  assert.equal(rollingDirection('Unavailable','KES 2.00'),'up');
});
test('place alignment rolls exact observations without inventing intermediate digits',()=>{
  const frame=rollingDigits('999.99','1,000.00');
  assert.equal(frame.map(d=>d.character).join(''),'1,000.00');
  assert.equal(frame[0].old,' ');
  assert.equal(frame.at(-1)?.old,'9');
  assert.equal(frame.at(-1)?.place,0);
  assert.equal(rollingDigits('100.00','100.00').some(d=>d.changed),false);
  assert.equal(rollingDigits('100.01','100.02').filter(d=>d.changed).length,1);
});
