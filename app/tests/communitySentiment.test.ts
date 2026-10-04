import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStockSentiment as classify } from '../src/lib/communitySentiment.ts';
test('sentiment respects negation and symbol context', () => {
  assert.equal(classify('$KCB not bullish', 'KCB'), 'neutral');
  assert.equal(classify('$KCB bullish but $SCOM bearish', 'KCB'), 'bullish');
  assert.equal(classify('$KCB bullish but $SCOM bearish', 'SCOM'), 'bearish');
  assert.equal(classify('a short update after a long meeting', 'KCB'), 'neutral');
  assert.equal(classify('$KCB buy the dip 🚀', 'KCB'), 'bullish');
  assert.equal(classify('$KCB undervalued but profit warning', 'KCB'), 'mixed');
});
