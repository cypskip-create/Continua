import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRoutes } from 'react-router-dom';
import { navigateBack } from '../src/lib/navigation.ts';

test('checkout and Settings fall back to the real account route', () => {
  for (const page of ['Upgrade', 'Settings']) {
    const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /navigateBack\(navigate,\s*["']\/profile["']/);
    assert.match(source, /navigateBack\(navigate,\s*["']\/account["']/);
  }
  const checkout = readFileSync(new URL('../src/pages/Upgrade.tsx', import.meta.url), 'utf8');
  assert.match(checkout, /reference \? navigate\("\/account",\{replace:true\}\)/,
    'Leaving a provider return must not go back into checkout');
});

test('actual route declarations resolve legacy profile links, callbacks and Home', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const [publicRoutes, privateRoutes] = source.split('<Route element={<MainLayout />}>');
  assert.ok(privateRoutes, 'Use a pathless layout rather than competing root splats');
  const paths = (text: string) => [...text.matchAll(/<Route path="([^"]+)"/g)].map(m => ({path: m[1]}));
  const routes = [...paths(publicRoutes), {children: paths(privateRoutes)}];
  for (const path of ['/auth', '/account', '/profile', '/profile/user-id', '/upgrade?reference=fixture', '/settings', '/markets', '/stock/SCOM']) {
    assert.notEqual(matchRoutes(routes, path)?.at(-1)?.route.path, '*', path);
  }
  assert.equal(matchRoutes(routes, '/')?.at(-1)?.route.path, '/', 'Home must reach the session-aware entry page');
  assert.equal(matchRoutes(routes, '/really-missing')?.at(-1)?.route.path, '*', 'Unknown pages still have an honest 404');
});

test('back navigation uses replacement fallback for direct visits and app history otherwise', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls: unknown[][] = [];
  const navigate = ((...args: unknown[]) => calls.push(args)) as Parameters<typeof navigateBack>[0];
  try {
    for (const idx of [undefined, 0]) {
      Object.defineProperty(globalThis, 'window', {configurable:true, value:{history:{state:{idx}}}});
      navigateBack(navigate, '/account');
      assert.deepEqual(calls.pop(), ['/account', {replace:true}]);
    }
    Object.defineProperty(globalThis, 'window', {configurable:true, value:{history:{state:{idx:1}}}});
    navigateBack(navigate, '/account');
    assert.deepEqual(calls.pop(), [-1]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
