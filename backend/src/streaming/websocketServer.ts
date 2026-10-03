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
import { marketEventBus, type MarketEvent } from "./pubsub.js";
import { logger } from "../monitoring/logger.js";
import { env } from "../config/index.js";
import { apiKeyRepository, hashApiKey } from "../storage/repositories/apiKeyRepository.js";
import { cache } from "../storage/cache.js";

interface ClientState {
  socket: WebSocket;
  symbols: Set<string>;
  authorized: boolean;
}

/** Same key check as the REST API's apiKeyAuth middleware, applied at the
 *  WebSocket upgrade instead of per-message — a socket either gets
 *  established or it doesn't, there's no per-frame auth in this protocol. */
async function isAuthorized(presentedKey: string | null): Promise<boolean> {
  if (!env.API_KEY_AUTH_ENABLED) return true;
  if (!presentedKey) return false;
  if (env.DEV_API_KEY && presentedKey === env.DEV_API_KEY) return true;
  const keyHash = hashApiKey(presentedKey);
  const record = await cache.getOrSet(`apikey:${keyHash}`, 30_000, () => apiKeyRepository.findActiveByHash(keyHash));
  return record !== null;
}

export function startWebSocketServer(httpServer: import("http").Server): WebSocketServer {
  // Attached to the same HTTP server/port as the REST API (rather than
  // opening its own TCP listener on WS_PORT) so this works on hosts that
  // only route a single public port per service — e.g. Render Web
  // Services. Railway happened to expose a second port as its own
  // subdomain, which masked this constraint; that's not a general
  // assumption we can keep making about every host.
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set<ClientState>();

  wss.on("connection", (socket) => {
    const state: ClientState = { socket, symbols: new Set(), authorized: !env.API_KEY_AUTH_ENABLED };
    clients.add(state);
    const authTimer = setTimeout(() => {
      if (!state.authorized) socket.close(1008, "Authentication timeout");
    }, 5000);
    authTimer.unref();

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.action === "authenticate" && typeof msg.apiKey === "string") {
          void isAuthorized(msg.apiKey)
            .then((ok) => {
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
              logger.error({ err }, "WebSocket auth check failed");
              socket.close(1011, "Authentication failed");
            });
          return;
        }
        if (!state.authorized) {
          socket.close(1008, "Authenticate before subscribing");
          return;
        }
        if (msg.action === "subscribe" && Array.isArray(msg.symbols)) {
          msg.symbols.forEach((s: string) => state.symbols.add(s.toUpperCase()));
        } else if (msg.action === "unsubscribe" && Array.isArray(msg.symbols)) {
          msg.symbols.forEach((s: string) => state.symbols.delete(s.toUpperCase()));
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid message — expected JSON { action, symbols }" }));
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      clients.delete(state);
      logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
    });
  });

  const unsubscribe = marketEventBus.onEvent((event: MarketEvent) => {
    const symbol = event.type === "quote" ? event.payload.symbol : undefined;
    for (const client of clients) {
      if (client.socket.readyState !== WebSocket.OPEN) continue;
      // No symbol filter (e.g. corporate_action broadcasts) → send to everyone
      // subscribed to anything; symbol-scoped events only go to matching subs.
      if (symbol && client.symbols.size > 0 && !client.symbols.has(symbol)) continue;
      client.socket.send(JSON.stringify(event));
    }
  });

  wss.on("close", unsubscribe);
  logger.info("WebSocket server attached to HTTP server");
  return wss;
}
