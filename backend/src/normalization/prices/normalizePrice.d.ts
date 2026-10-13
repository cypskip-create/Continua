/**
 * Exchange-agnostic cleanup applied to every Quote, regardless of which
 * adapter produced it. The adapter's job is translation (NSE fields →
 * standard fields); this layer's job is enforcing Continua-wide rules
 * that apply no matter the source: rounding, derived-field consistency,
 * sane clamping. Runs AFTER mapping, BEFORE validation/storage.
 */
import type { Quote } from "../../types/market.js";
export declare function normalizePrice(quote: Quote): Quote;
