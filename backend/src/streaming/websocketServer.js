/**
 * Pushes live price + corporate-action events to subscribed clients.
 * Clients subscribe to specific symbols/channels so we only ever send them
 * data they asked for — not the whole exchange's tape on every tick.
 *
 * Authenticate as the first frame: { "action": "authenticate", "apiKey":
 * "..." }. Keeping credentials out of URLs prevents them being retained in
 * reverse-proxy access logs and observability traces.
 *
 * Client protocol (JSON messages over the WS connection):
 *   → { "action": "subscribe",   "symbols": ["SCOM", "EQTY"] }
 *   → { "action": "unsubscribe", "symbols": ["EQTY"] }
 *   ← { "type": "quote", "payload": Quote }
 *   ← { "type": "corporate_action", "payload": CorporateAction }
 */
import { WebSocketServer, WebSocket } from "ws";
import { marketEventBus } from "./pubsub.js";
import { logger } from "../monitoring/logger.js";
import { env } from "../config/index.js";
import { findApiKey } from '../services/apiKeyAccess.js';
import {getIdentityRuntime} from '../auth/runtime.js';
import {isAllowedBrowserOrigin} from '../api/corsPolicy.js';
import {createPrivateSnapshotFeed,readAuthorizedSnapshot} from './privateSnapshotFeed.js';
/** Same key check as the REST API's apiKeyAuth middleware, applied at the
 *  WebSocket upgrade instead of per-message — a socket either gets
 *  established or it doesn't, there's no per-frame auth in this protocol. */
async function isAuthorized(presentedKey) {
    if (!env.API_KEY_AUTH_ENABLED)
        return true;
    if (!presentedKey)
        return false;
    if (env.DEV_API_KEY && presentedKey === env.DEV_API_KEY)
        return true;
    const record = await findApiKey(presentedKey);
    return record !== null;
}
export function startWebSocketServer(httpServer, {identityRuntime} = {}) {
    // Attached to the same HTTP server/port as the REST API (rather than
    // opening its own TCP listener on WS_PORT) so this works on hosts that
    // only route a single public port per service — e.g. Render Web
    // Services. Railway happened to expose a second port as its own
    // subdomain, which masked this constraint; that's not a general
    // assumption we can keep making about every host.
    const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024, perMessageDeflate: false });
    const clients = new Set();
    const privateClients = new Set();
    const privateByUser = new Map();
    let authenticating = 0;
    wss.on("connection", (socket, request) => {
        if (clients.size >= 128) { socket.close(1013, 'Connection capacity reached'); return; }
        const state = { socket, symbols: new Set(), authorized: !env.API_KEY_AUTH_ENABLED };
        let authPending = false, messages = 0, windowStart = Date.now();
        clients.add(state);
        const authTimer = setTimeout(() => {
            if (!state.authorized && !state.privateUserId)
                socket.close(1008, "Authentication timeout");
        }, 5000);
        authTimer.unref();
        socket.on("message", (raw) => {
            if (Date.now() - windowStart >= 60_000) {windowStart = Date.now(); messages = 0;}
            if (++messages > 120) {socket.close(1008, 'Message limit exceeded'); return;}
            try {
                const msg = JSON.parse(raw.toString());
                if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw Error('Invalid message');
                if(msg.action==='authenticate_user'){
                    // User JWTs authorize private snapshots only. They never
                    // replace the API-key check for the market subscription.
                    const origin=request?.headers?.origin;
                    if(request?.url!=='/api/v1/events'||!origin||!isAllowedBrowserOrigin(origin,env.ALLOWED_ORIGINS)||typeof msg.token!=='string'||msg.token.length>16384||authPending||authenticating>=32||(!state.privateUserId&&privateClients.size>=32)){socket.close(1008,'Private authentication unavailable');return;}
                    authPending=true;authenticating++;
                    void (async()=>{
                        const runtime=identityRuntime??getIdentityRuntime();if(!runtime)throw Error('Owned identity unavailable');
                        const identity=await runtime.verifyAccess(msg.token);
                        if(socket.readyState!==WebSocket.OPEN)return;
                        if(!state.privateUserId&&privateClients.size>=32){socket.close(1013,'Private connection capacity reached');return;}
                        if(state.privateUserId&&state.privateUserId!==identity.user.id){socket.close(1008,'Account changed');return;}
                        if(!state.privateUserId){const count=privateByUser.get(identity.user.id)??0;if(count>=4){socket.close(1013,'Account connection capacity reached');return;}privateByUser.set(identity.user.id,count+1);}
                        state.privateUserId=identity.user.id;state.privateToken=msg.token;privateClients.add(state);clearTimeout(authTimer);
                        if(!state.privateFeed)state.privateFeed=createPrivateSnapshotFeed({
                            readSnapshot:(table,filterId)=>readAuthorizedSnapshot({...runtime,token:state.privateToken,table,filterId}),
                            send:event=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(event));},
                            close:(code,reason)=>socket.close(code,reason),
                            canSend:()=>socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<=512*1024,
                        });
                        socket.send(JSON.stringify({type:'authenticated_user'}));
                    })().catch(()=>socket.close(1008,'Private authentication failed')).finally(()=>{authPending=false;authenticating--;});
                    return;
                }
                if(['subscribe_private','unsubscribe_private'].includes(msg.action)){
                    if(!state.privateFeed){socket.close(1008,'Authenticate before subscribing');return;}
                    try{if(msg.action==='subscribe_private')state.privateFeed.subscribe(msg.table,msg.filterId);else state.privateFeed.unsubscribe(msg.table,msg.filterId);}
                    catch{socket.close(1008,'Invalid private subscription');}
                    return;
                }
                if (msg.action === "authenticate" && typeof msg.apiKey === "string") {
                    if (state.authorized) {socket.send(JSON.stringify({type: 'authenticated'})); return;}
                    if (authPending || authenticating >= 32 || msg.apiKey.length > 512) {socket.close(1008, 'Authentication unavailable'); return;}
                    authPending = true; authenticating++;
                    void isAuthorized(msg.apiKey)
                        .then((ok) => {
                        if (socket.readyState !== WebSocket.OPEN) return;
                        if (!ok) {
                            socket.close(1008, "Invalid API key");
                            return;
                        }
                        state.authorized = true;
                        clearTimeout(authTimer);
                        socket.send(JSON.stringify({ type: "authenticated" }));
                        logger.info({ clientCount: clients.size }, "WebSocket client authenticated");
                    })
                        .catch((err) => {
                        logger.warn("WebSocket auth check failed");
                        socket.close(1011, "Authentication failed");
                    }).finally(() => {authPending = false; authenticating--;});
                    return;
                }
                if (!state.authorized) {
                    socket.close(1008, "Authenticate before subscribing");
                    return;
                }
                if (msg.action === "subscribe" && Array.isArray(msg.symbols)) {
                    if (msg.symbols.length > 100 || msg.symbols.some(s => typeof s !== 'string' || !/^[A-Z0-9.-]{1,20}$/i.test(s))) {socket.close(1008, 'Invalid symbols'); return;}
                    const next = new Set([...state.symbols, ...msg.symbols.map(s => s.toUpperCase())]);
                    if (next.size > 100) {socket.close(1008, 'Subscription limit exceeded'); return;}
                    state.symbols = next;
                }
                else if (msg.action === "unsubscribe" && Array.isArray(msg.symbols)) {
                    if (msg.symbols.length > 100 || msg.symbols.some(s => typeof s !== 'string')) {socket.close(1008, 'Invalid symbols'); return;}
                    msg.symbols.forEach((s) => state.symbols.delete(s.toUpperCase()));
                }
            }
            catch {
                socket.send(JSON.stringify({ type: "error", message: "Invalid message — expected JSON { action, symbols }" }));
            }
        });
        socket.on('error', () => socket.terminate());
        socket.on("close", () => {
            clearTimeout(authTimer);
            state.privateFeed?.stop();state.privateToken=null;privateClients.delete(state);
            if(state.privateUserId){const count=(privateByUser.get(state.privateUserId)??1)-1;if(count>0)privateByUser.set(state.privateUserId,count);else privateByUser.delete(state.privateUserId);}
            clients.delete(state);
            logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
        });
    });
    const unsubscribe = marketEventBus.onEvent((event) => {
        const symbol = event.type === "quote" ? event.payload.symbol : undefined;
        for (const client of clients) {
            if (!client.authorized || client.socket.readyState !== WebSocket.OPEN)
                continue;
            // No symbol filter (e.g. corporate_action broadcasts) → send to everyone
            // subscribed to anything; symbol-scoped events only go to matching subs.
            if (symbol && !client.symbols.has(symbol))
                continue;
            if (client.socket.bufferedAmount > 512 * 1024) {client.socket.close(1013, 'Consumer too slow'); continue;}
            client.socket.send(JSON.stringify(event));
        }
    });
    wss.on("close", unsubscribe);
    logger.info("WebSocket server attached to HTTP server");
    return wss;
}
