/** Legal suffix differences are not entity changes. Never drop Group,
 * country or subsidiary names, and never use fuzzy/substring matching. */
export declare function legalIssuerIdentity(value: string): string;
export declare function issuerMastheadMatches(text: string, name: string): boolean;
