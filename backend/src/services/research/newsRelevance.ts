/** Conservative, auditable issuer relevance. No inferred price direction. */
export interface NewsIssuer { securityId: string; symbol: string; companyName: string }
export interface IssuerEvidence { securityId: string; symbol: string; companyName: string; evidence: string; basis: "headline" | "article"; relationship: "issuer" | "brand" }
const aliases: Record<string, string[]> = {
  SCOM: ["Safaricom", "M-Pesa", "MPesa"], KQ: ["Kenya Airways"],
  KPLC: ["Kenya Power", "Kenya Power and Lighting"], KEGN: ["KenGen", "Kenya Electricity Generating"],
  EQTY: ["Equity Bank", "Equity Group", "Equity BCDC"], KCB: ["KCB Bank", "KCB Group", "Kenya Commercial Bank"],
  COOP: ["Co-operative Bank", "Cooperative Bank", "Co-op Bank"], ABSA: ["Absa Bank", "Absa Kenya", "Absa"],
  JUB: ["Jubilee Health", "Jubilee Insurance", "Jubilee Holdings"], TOTL: ["TotalEnergies", "Total Energies", "Total Kenya"],
  BRIT: ["Britam"], BAMB: ["Bamburi Cement"], SCBK: ["Standard Chartered"],
  IMH: ["I&M Bank", "I&M Group"], NCBA: ["NCBA", "NCBA Bank"], DTK: ["Diamond Trust Bank"],
  BKG: ["Bank of Kigali", "BK Group"],
};
const generic = new Set(["equity", "total", "express", "standard", "jubilee", "liberty", "national", "home", "car", "crown", "capital", "mobile", "image", "gold", "bond", "kenya", "bank", "nse"]);
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boilerplate = /^(?:related(?: stories| articles| posts)?|also read|read also|recommended|more (?:stories|news)|latest (?:news|stories)|you may also like|market watch|stock prices|share prices|trending|advertisement|subscribe|follow us)\b/i;
const priceRail = /(?:\b(?:KES|KSH|KSHS)\s*[\d,.]+|[+-]\d+(?:\.\d+)?%)/gi;
export function articleEvidenceText(headline: string, raw: string): string {
  const allLines = raw.replace(/<[^>]*>/g, " ").split(/\n+/).map(s => s.replace(/\s+/g, " ").trim());
  const titleIndex = allLines.findIndex(line => normalize(line) === normalize(headline));
  const lines = titleIndex >= 0 ? allLines.slice(titleIndex + 1) : allLines;
  const selected: string[] = [];
  for (const line of lines) {
    if (boilerplate.test(line)) break;
    if (normalize(line) === normalize(headline) || line.length < 35) continue;
    if ((line.match(priceRail)?.length ?? 0) >= 2) continue;
    if (/\b(track your portfolio|cookie|privacy policy|all rights reserved|sign up|newsletter)\b/i.test(line)) continue;
    selected.push(line);
    if (selected.join(" ").length >= 4000) break;
  }
  return selected.join("\n").slice(0, 4000);
}
export function analyzeNewsIssuers(headline: string, raw: string, directory: NewsIssuer[]): IssuerEvidence[] {
  const body = articleEvidenceText(headline, raw);
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).filter(s => s.length >= 35);
  const normalizedSentences = new Map(sentences.map(s => [s, ` ${normalize(s)} `]));
  const normalizedHeadline = ` ${normalize(headline)} `;
  const matches: IssuerEvidence[] = [];
  for (const issuer of directory) {
    const symbol = issuer.symbol.toUpperCase();
    // Safaricom has one canonical NSE ticker. Ignore erroneous directory rows.
    if (/^safaricom\b/i.test(issuer.companyName) && symbol !== "SCOM") continue;
    const canonical = symbol;
    // Market-wide exchange reporting is not automatically issuer news for
    // the listed exchange operator. Require its own corporate development.
    if (canonical === "NSE" && !/\b(?:NSE|Nairobi Securities Exchange)(?:\s+PLC)?\s+(?:reports?|posts?|announces?|declares?)\b.*\b(?:profit|earnings|revenue|dividend|results)\b/i.test(headline + " " + body)) continue;
    const fullName = issuer.companyName.replace(/\b(?:plc|ltd|limited|incorporated|holdings)\b/gi, " ").replace(/\s+/g, " ").trim();
    const core = normalize(fullName);
    const phrases = [...new Set([...(aliases[canonical] ?? []), ...(core.length >= 5 && !generic.has(core) ? [fullName] : [])])];
    const normalizedPhrases = phrases.map(p => ({original:p, normalized:` ${normalize(p)} `}));
    const phraseIn = (text: string) => {
      const normalized = text === headline ? normalizedHeadline : normalizedSentences.get(text) ?? ` ${normalize(text)} `;
      return normalizedPhrases.find(p => normalized.includes(p.normalized))?.original;
    };
    const ticker = new RegExp(`(?:\\$${escape(symbol)}\\b|\\(${escape(symbol)}\\)|\\bNSE\\s*:\\s*${escape(symbol)}\\b)`);
    const headlineTicker = symbol.length >= 3 && !generic.has(symbol.toLowerCase()) && new RegExp(`\\b${escape(symbol)}\\b`).test(headline);
    const titlePhrase = phraseIn(headline);
    if (titlePhrase || ticker.test(headline) || headlineTicker) {
      matches.push({ ...issuer, evidence: headline.slice(0, 300), basis: "headline", relationship: titlePhrase && /m.?pesa|jubilee health|equity bcdc/i.test(titlePhrase) ? "brand" : "issuer" });
      continue;
    }
    const sentence = sentences.find(s => phraseIn(s) || ticker.test(s));
    if (!sentence) continue;
    const named = directory.filter(i => (aliases[i.symbol] ?? [i.companyName]).some(p => (` ${normalize(sentence)} `).includes(` ${normalize(p)} `)));
    if (named.length > 3) continue;
    matches.push({ ...issuer, evidence: sentence.slice(0, 300), basis: "article", relationship: /m.?pesa|jubilee health|equity bcdc/i.test(phraseIn(sentence) ?? "") ? "brand" : "issuer" });
  }
  return matches;
}
