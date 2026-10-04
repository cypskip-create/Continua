import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

async function invoke(name: string, price: number) {
  const source = readFileSync(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  let handler: (req: Request) => Promise<Response>;
  const delivered: unknown[] = [];
  const alert = { id: 'fixture-alert', user_id: 'fixture-user', symbol: 'KCB', exchange: 'NSE', currency: 'KES', alert_type: 'price_above', target_value: 90, indicator: null, updated_at: '2026-01-01' };
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'is']) chain[key] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => resolve({ data: [alert], error: null });
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'fixture-user' } } }) },
    from: () => chain,
    rpc: async (name: string, args: unknown) => { assert.equal(name, 'deliver_alert_notification'); delivered.push(args); return { data: true, error: null }; },
  };
  const env: Record<string, string> = { CONTINUA_DATA_BASE_URL: 'https://backend.invalid', CONTINUA_DATA_API_KEY: 'fixture', ALERTS_CRON_SECRET: 'fixture-secret' };
  vm.runInNewContext(code, { console, Request, Response, URL, AbortSignal,
    Deno: { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => client,
    fetch: async () => Response.json({ data: [{ symbol: 'KCB', exchange: 'NSE', lastPrice: price }] }),
  });
  const response = await handler!(new Request('https://edge.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'x-cron-secret': 'fixture-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'KCB', exchange: 'NSE', currentPrice: 99999 }) }));
  return { response, data: await response.json(), delivered };
}
test('quick alert check ignores a forged client price and uses the backend quote', async () => {
  const result = await invoke('check-price-alerts', 80);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.triggered, 0);
  assert.equal(result.delivered.length, 0);
});
test('quick and scheduled checks parse the quotes data envelope and deliver atomically', async () => {
  for (const name of ['check-price-alerts', 'run-price-alerts']) {
    const result = await invoke(name, 100);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.triggered, 1);
    assert.equal(result.delivered.length, 1);
  }
});
