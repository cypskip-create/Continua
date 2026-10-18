// Shared real-time connection to the Continua Data Layer's WebSocket
// server (backend/src/streaming/websocketServer.ts). One socket for the
// whole app — Stock Page, Watchlist, Portfolio, and Markets all subscribe
// through this same manager instead of each opening its own connection.
//
// Protocol (docs/api/API.md):
//   → { action: "authenticate", apiKey: "..." }
//   ← { type: "authenticated" }
//   → { action: "subscribe",   symbols: ["SCOM", "EQTY"] }
//   → { action: "unsubscribe", symbols: ["EQTY"] }
//   ← { type: "quote", payload: Quote }
//   ← { type: "corporate_action", payload: CorporateAction }

import { AFRIFINANCE_WS_URL } from "./client";
import type { MarketEvent, Quote, CorporateAction } from "./types";

type QuoteListener = (quote: Quote) => void;
type CorporateActionListener = (action: CorporateAction) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

class ContinuaRealtimeClient {
  private socket: WebSocket | null = null;
  private connecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authorized = false;
  private rejected = false;

  /** symbol -> set of listeners currently interested in it */
  private quoteListeners = new Map<string, Set<QuoteListener>>();
  private corporateActionListeners = new Set<CorporateActionListener>();
  private connectionListeners = new Set<(connected: boolean) => void>();

  private get subscribedSymbols(): string[] {
    return [...this.quoteListeners.keys()];
  }

  private getApiKey(): string {
    return (import.meta.env.VITE_CONTINUA_API_KEY as string | undefined) ??
      (import.meta.env.VITE_AFRIFINANCE_API_KEY as string | undefined) ??
      "dev-local-only-key";
  }

  private ensureConnected() {
    // Hosted pages use the server-key HTTP gateway and existing quote polling.
    // Never authenticate production sockets with a development placeholder.
    if (import.meta.env.PROD || this.rejected) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    if (this.connecting) return;
    this.connecting = true;

    const socket = new WebSocket(AFRIFINANCE_WS_URL);
    this.socket = socket;

    socket.onopen = () => {
      this.connecting = false;
      // Authenticate inside the encrypted WebSocket stream. Credentials in
      // query strings are routinely captured by access logs and monitoring.
      socket.send(JSON.stringify({ action: "authenticate", apiKey: this.getApiKey() }));
    };

    socket.onmessage = (event) => {
      let parsed: MarketEvent | undefined;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      if ((parsed as { type?: string }).type === "authenticated") {
        this.authorized = true;
        this.reconnectAttempt = 0;
        this.notifyConnection(true);
        if (this.subscribedSymbols.length > 0) {
          this.send({ action: "subscribe", symbols: this.subscribedSymbols });
        }
      } else if (parsed.type === "quote") {
        const listeners = this.quoteListeners.get(parsed.payload.symbol.toUpperCase());
        listeners?.forEach((l) => l(parsed!.payload as Quote));
      } else if (parsed.type === "corporate_action") {
        this.corporateActionListeners.forEach((l) => l(parsed!.payload as CorporateAction));
      }
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.connecting = false;
      this.authorized = false;
      this.socket = null;
      if (event.code === 1008) this.rejected = true;
      this.notifyConnection(false);
      // Only keep trying to reconnect while someone still wants data.
      if (!this.rejected && (this.subscribedSymbols.length > 0 || this.corporateActionListeners.size > 0)) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // onclose fires right after and handles reconnect — nothing extra needed here.
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private send(msg: { action: "subscribe" | "unsubscribe"; symbols: string[] }) {
    if (this.authorized && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private notifyConnection(connected: boolean) {
    this.connectionListeners.forEach((l) => l(connected));
  }

  isConnected(): boolean {
    return this.authorized && this.socket?.readyState === WebSocket.OPEN;
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  /** Subscribe to live quote ticks for one symbol. Multiple callers can
   *  subscribe to the same symbol — only the FIRST subscriber triggers a
   *  `subscribe` message to the server, and only the LAST unsubscribe
   *  triggers `unsubscribe`, so N components watching SCOM still share
   *  one server-side subscription. */
  subscribeQuote(symbol: string, listener: QuoteListener): () => void {
    const key = symbol.toUpperCase();
    let listeners = this.quoteListeners.get(key);
    const isNewSymbol = !listeners;
    if (!listeners) {
      listeners = new Set();
      this.quoteListeners.set(key, listeners);
    }
    listeners.add(listener);

    this.ensureConnected();
    if (isNewSymbol) this.send({ action: "subscribe", symbols: [key] });

    return () => {
      const set = this.quoteListeners.get(key);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) {
        this.quoteListeners.delete(key);
        this.send({ action: "unsubscribe", symbols: [key] });
      }
      this.closeIfIdle();
    };
  }

  onCorporateAction(listener: CorporateActionListener): () => void {
    this.corporateActionListeners.add(listener);
    this.ensureConnected();
    return () => {this.corporateActionListeners.delete(listener); this.closeIfIdle();};
  }

  private closeIfIdle() {
    if (this.quoteListeners.size || this.corporateActionListeners.size) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'No active subscriptions');
  }
}

/** One instance for the whole app — import this, don't construct your own. */
export const continuaRealtime = new ContinuaRealtimeClient();
