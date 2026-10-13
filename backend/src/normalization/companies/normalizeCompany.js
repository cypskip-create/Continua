/** Canonical sector list. Every exchange's raw sector string should map to
 *  one of these via the adapter's mapper — this layer just guards against
 *  accidental casing/whitespace drift getting stored as a "new" sector. */
const CANONICAL_SECTORS = [
    "Banking", "Insurance", "Telecommunications", "Energy & Petroleum",
    "Manufacturing & Allied", "Construction & Allied", "Agricultural",
    "Commercial & Services", "Investment", "Real Estate", "Technology", "Automobiles & Accessories",
];
export function canonicalizeSector(raw) {
    const trimmed = raw.trim();
    const match = CANONICAL_SECTORS.find((s) => s.toLowerCase() === trimmed.toLowerCase());
    return match ?? trimmed;
}
export function normalizeCompany(company) {
    return {
        ...company,
        name: company.name.trim(),
        description: company.description?.trim(),
        headquarters: company.headquarters?.trim(),
    };
}
export function normalizeSecurity(security) {
    return { ...security, symbol: security.symbol.trim().toUpperCase() };
}
