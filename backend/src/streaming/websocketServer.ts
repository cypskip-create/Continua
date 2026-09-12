/**
 * Pushes live price + corporate-action events to subscribed clients.
 * Clients subscribe to specific symbols/channels so we only ever send them
 * data they asked for — not the whole exchange's tape on every tick.
 *
 * Connect with an API key as a query param: ws://host:port?apiKey=<key>
 * (same keys issued via `npm run apikey:create`, or DEV_API_KEY locally).
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
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const url = new URL(info.req.url ?? "", "http://localhost");
      const presented = url.searchParams.get("apiKey");
      isAuthorized(presented)
        .then((ok) => callback(ok, ok ? undefined : 401, ok ? undefined : "Missing or invalid API key — connect with ?apiKey=<key>"))
        .catch((err) => {
          logger.error({ err }, "WebSocket auth check failed");
          callback(false, 500, "Internal error during auth check");
        });
    },
  });
  const clients = new Set<ClientState>();

  wss.on("connection", (socket) => {
    const state: ClientState = { socket, symbols: new Set() };
    clients.add(state);
    logger.info({ clientCount: clients.size }, "WebSocket client connected");

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
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