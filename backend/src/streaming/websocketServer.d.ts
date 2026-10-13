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
import { WebSocketServer } from "ws";
export declare function startWebSocketServer(httpServer: import("http").Server): WebSocketServer;
