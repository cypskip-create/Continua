/**
 * ─────────────────────────────────────────────────────────────────────────
 * Continua Standard Schema
 * ─────────────────────────────────────────────────────────────────────────
 * This is the ONE shape every exchange in the system must normalize into.
 * NSE speaks NSE. NGX will speak NGX. JSE will speak JSE. None of that
 * leaves the adapter layer — everything above (ingestion, storage,
 * calculation, API, the app) only ever sees these types. That's what makes
 * adding a new exchange later a matter of writing one adapter, not touching
 * the rest of the system.
 * ─────────────────────────────────────────────────────────────────────────
 */
export {};
