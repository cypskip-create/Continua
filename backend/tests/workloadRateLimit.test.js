import {afterEach, expect, it, vi} from 'vitest';
import express from 'express';
vi.mock('../src/config/index.js', () => ({env: {CACHE_DRIVER: 'memory', ADMIN_API_KEY: 'fixture-admin-key', NODE_ENV: 'test', LOG_LEVEL: 'silent'}}));
vi.mock('../src/storage/cache.js', () => ({cache: {}}));
import {workloadPolicy, workloadRateLimit, adminRateLimit} from '../src/api/middleware/workloadRateLimit.js';
import {requireAdminKey} from '../src/api/middleware/requireAdminKey.js';
let server;
afterEach(async () => {if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined;}});
async function serve(app) {
    server = await new Promise(resolve => {const listening = app.listen(0, '127.0.0.1', () => resolve(listening));});
    return 'http://127.0.0.1:' + server.address().port;
}
it('uses finite classes and excludes ordinary market reads', () => {
    for (const [path, method, expected] of [
        ['/portfolios/abc/export', 'GET', ['transfer', 5]], ['/portfolios/import', 'POST', ['transfer', 5]],
        ['/billing/checkout', 'POST', ['billing', 20]], ['/engine/COOP', 'GET', ['research', 30]],
        ['/engine/notebooks', 'POST', ['calculation-write', 20]], ['/portfolios/abc', 'DELETE', ['mutation', 30]],
        ['/quotes/latest', 'GET', null], ['/not-exportable', 'GET', null],
    ]) expect(workloadPolicy({path, method})).toEqual(expected);
});
it('verified users have independent write limits and changing query parameters cannot reset them', async () => {
    const app = express(); app.use('/api/v1', (req, res, next) => {
        res.locals.engineIdentityVerified = true; res.locals.engineUserId = req.get('fixture-user'); next();
    }, workloadRateLimit(), (_req, res) => res.sendStatus(200));
    const base = await serve(app);
    for (let i = 0; i < 20; i++) expect((await fetch(base + '/api/v1/engine/notebooks?nonce=' + i, {method: 'POST', headers: {'fixture-user': 'a'}})).status).toBe(200);
    const limited = await fetch(base + '/api/v1/engine/notebooks', {method: 'POST', headers: {'fixture-user': 'a'}});
    expect(limited.status).toBe(429); expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await fetch(base + '/api/v1/engine/notebooks', {method: 'POST', headers: {'fixture-user': 'b'}})).status).toBe(200);
    expect((await fetch(base + '/api/v1/quotes/latest', {headers: {'fixture-user': 'a'}})).status).toBe(200);
});
it('admin credential guesses cannot rotate a pre-verification connection bucket', async () => {
    const app = express(); app.use('/admin', adminRateLimit(), requireAdminKey(), (_req, res) => res.sendStatus(200));
    app.use((error, _req, res, _next) => res.status(error.status ?? error.statusCode ?? 500).json({error: 'Denied'}));
    const base = await serve(app);
    expect((await fetch(base + '/admin', {headers: {'x-admin-key': 'fixture-admin-key'}})).status).toBe(200);
    for (let i = 0; i < 19; i++) expect((await fetch(base + '/admin', {headers: {'x-admin-key': 'guess-' + i}})).status).toBe(401);
    expect((await fetch(base + '/admin', {headers: {'x-admin-key': 'fixture-admin-key'}})).status).toBe(429);
});
