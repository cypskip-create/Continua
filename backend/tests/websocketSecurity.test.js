import {afterEach, expect, it, vi} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket} from 'ws';
vi.mock('../src/config/index.js', () => ({env: {API_KEY_AUTH_ENABLED: true, DEV_API_KEY: 'fixture-only', NODE_ENV: 'test', LOG_LEVEL: 'silent'}}));
vi.mock('../src/services/apiKeyAccess.js', () => ({findApiKey: async () => null}));
import {startWebSocketServer} from '../src/streaming/websocketServer.js';
import {marketEventBus} from '../src/streaming/pubsub.js';
let http, wss; const sockets = [];
afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    if (wss) {for (const client of wss.clients) client.terminate(); await new Promise(resolve => wss.close(resolve));}
    if (http) await new Promise(resolve => http.close(resolve));
    http = undefined; wss = undefined;
});
async function connect() {
    if (!http) {http = createServer(); wss = startWebSocketServer(http); http.listen(0, '127.0.0.1'); await once(http, 'listening');}
    const socket = new WebSocket('ws://127.0.0.1:' + http.address().port); sockets.push(socket); await once(socket, 'open'); return socket;
}
async function receive(socket, action) {const next = once(socket, 'message'); action(); return JSON.parse((await next)[0].toString());}
it('never broadcasts to an unauthenticated socket, including before its first auth frame', async () => {
    const socket = await connect(), received = [];
    socket.on('message', raw => received.push(JSON.parse(raw.toString())));
    marketEventBus.publishQuote({symbol: 'COOP', lastPrice: 1});
    marketEventBus.publishCorporateAction({symbol: 'COOP'});
    expect(await receive(socket, () => socket.send(JSON.stringify({action: 'authenticate', apiKey: 'fixture-only'})))).toEqual({type: 'authenticated'});
    expect(received).toEqual([{type: 'authenticated'}]);
});
it('requires an explicit symbol subscription and rejects invalid authentication', async () => {
    const socket = await connect(), received = [];
    await receive(socket, () => socket.send(JSON.stringify({action: 'authenticate', apiKey: 'fixture-only'})));
    socket.on('message', raw => received.push(JSON.parse(raw.toString())));
    marketEventBus.publishQuote({symbol: 'COOP', lastPrice: 1});
    await receive(socket, () => socket.send(JSON.stringify({action: 'authenticate', apiKey: 'fixture-only'})));
    expect(received).toEqual([{type: 'authenticated'}]); received.length = 0;
    socket.send(JSON.stringify({action: 'subscribe', symbols: ['COOP']}));
    await receive(socket, () => socket.send(JSON.stringify({action: 'authenticate', apiKey: 'fixture-only'})));
    expect((await receive(socket, () => marketEventBus.publishQuote({symbol: 'COOP', lastPrice: 2}))).payload.lastPrice).toBe(2);
    const denied = await connect(), closed = once(denied, 'close'); denied.send(JSON.stringify({action: 'authenticate', apiKey: 'wrong'}));
    expect((await closed)[0]).toBe(1008);
});
