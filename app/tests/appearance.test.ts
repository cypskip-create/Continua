import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFontScale, getFontScale, normalizeFontScale, FONT_SCALE_EVENT } from "../src/lib/appearance.ts";

test("font scale supports precise percentages, preserves legacy settings and clamps safely", () => {
  for (const value of ["0.5", "0.63", "0.9", "1", "1.1", "1.2", "1.37", "1.5"]) assert.equal(normalizeFontScale(value), value);
  assert.equal(normalizeFontScale("0.637"), "0.64");
  assert.equal(normalizeFontScale("0.001"), "0.5");
  assert.equal(normalizeFontScale("9"), "1.5");
  for (const value of ["", "bad", "Infinity", "NaN"]) assert.equal(normalizeFontScale(value), "1");
});

test("slider settings apply immediately, persist, broadcast and recover from disabled storage", () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const style: {fontSize?: string; setProperty: (name: string, value: string) => void} = {setProperty: () => {}};
  const saved = new Map<string, string>();
  const events: string[] = [];
  Object.defineProperties(globalThis, {
    document: {configurable: true, value: {documentElement: {style}}},
    window: {configurable: true, value: {dispatchEvent: (event: Event) => events.push(event.type)}},
    localStorage: {configurable: true, value: {getItem: (key: string) => saved.get(key), setItem: (key: string, value: string) => saved.set(key, value)}},
  });
  try {
    applyFontScale("0.63");
    assert.equal(style.fontSize, "10.08px");
    assert.equal(getFontScale(), "0.63");
    assert.deepEqual(events, [FONT_SCALE_EVENT]);
    applyFontScale("1.37");
    assert.equal(style.fontSize, "21.92px");
    assert.equal(getFontScale(), "1.37");
    Object.defineProperty(globalThis, "localStorage", {configurable: true, get: () => {throw new Error("Storage unavailable");}});
    assert.doesNotThrow(() => applyFontScale("0.63"));
    assert.equal(getFontScale(), "0.63");
    assert.doesNotThrow(() => applyFontScale("1"));
    assert.equal(style.fontSize, "16px");
    assert.equal(getFontScale(), "1");
  } finally {
    for (const key of ["document", "window", "localStorage"]) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
