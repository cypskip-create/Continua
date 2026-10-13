/** Legal suffix differences are not entity changes. Never drop Group,
 * country or subsidiary names, and never use fuzzy/substring matching. */
export function legalIssuerIdentity(value) {
    return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ').trim()
        .replace(/\s+(?:public limited company|plc|limited|ltd)\s*$/, '').replace(/\s+/g, '');
}
export function issuerMastheadMatches(text, name) {
    const target = legalIssuerIdentity(name);
    return !!target && text.slice(0, 4000).split(/\r?\n/).some(line => {
        const masthead = line.trim().replace(/\s+(?:audited|unaudited|consolidated|condensed|annual|financial|results)\b.*$/i, '');
        return legalIssuerIdentity(masthead) === target;
    });
}
