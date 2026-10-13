/**
 * In-process pub/sub bridging ingestion → WebSocket layer. Workers publish
 * normalized events here; websocketServer.ts subscribes and fans them out
 * to connected clients. Single-process today; if this ever needs to scale
 * across multiple API instances, swap the EventEmitter here for a Redis
 * pub/sub channel — nothing outside this file needs to change.
 */
import { EventEmitter } from "node:events";
import type { Quote, CorporateAction } from "../types/market.js";
export type MarketEvent = {
    type: "quote";
    payload: Quote;
} | {
    type: "corporate_action";
    payload: CorporateAction;
};
declare class MarketEventBus extends EventEmitter {
    publishQuote(quote: Quote): void;
    publishCorporateAction(action: CorporateAction): void;
    onEvent(handler: (event: MarketEvent) => void): () => this;
}
export declare const marketEventBus: MarketEventBus;
export {};
