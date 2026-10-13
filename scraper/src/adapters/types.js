/**
 * The contract every source adapter implements (§10 of the original
 * spec). The generic crawler (Phase 1, crawler/crawlSource.ts) handles
 * "follow links blindly within a domain" — that's the right approach for
 * an unknown/generic source. A source like NSE's announcements page
 * needs adapter-specific knowledge (which links are actual documents,
 * what metadata to pair with them) that must NOT leak into the generic
 * crawler. This interface is that boundary.
 *
 * NSE is the first real adapter (src/adapters/nse/announcementsAdapter.ts)
 * and intentionally does NOT reuse crawlSource.ts's queue-based loop —
 * its discover() step requires understanding the announcements page's
 * heading+link pairing, which is adapter knowledge, not generic crawling.
 */
export {};
