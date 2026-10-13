/**
 * In-process pub/sub bridging ingestion → WebSocket layer. Workers publish
 * normalized events here; websocketServer.ts subscribes and fans them out
 * to connected clients. Single-process today; if this ever needs to scale
 * across multiple API instances, swap the EventEmitter here for a Redis
 * pub/sub channel — nothing outside this file needs to change.
 */
import { EventEmitter } from "node:events";
class MarketEventBus extends EventEmitter {
    publishQuote(quote) {
        this.emit("event", { type: "quote", payload: quote });
    }
    publishCorporateAction(action) {
        this.emit("event", { type: "corporate_action", payload: action });
    }
    onEvent(handler) {
        this.on("event", handler);
        return () => this.off("event", handler);
    }
}
export const marketEventBus = new MarketEventBus();
marketEventBus.setMaxListeners(200);
