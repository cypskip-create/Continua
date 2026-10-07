/** Extract source sentences without adding claims or changing negation. */
export function summarizeNews(headline: string, content: string | null | undefined, excerpt: string | null) {
  const text = (content || excerpt || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
  const sentences = text.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g)?.map(s => s.trim()).filter(s => s.length > 25) ?? [];
  const unique = [...new Set(sentences)].filter(s => s.toLowerCase() !== headline.toLowerCase());
  const ranked = unique.map((sentence, index) => ({ sentence, index, score: /\b(revenue|profit|earnings|dividend|debt|cash flow|regulator|acquisition|loss|forecast)\b/i.test(sentence) ? 2 : 0 }));
  const selected = ranked.sort((a,b) => b.score-a.score || a.index-b.index).slice(0,3).sort((a,b) => a.index-b.index);
  // Fall back to the publisher's excerpt/headline when no complete sentence fits.
  const summary = selected.map(s => s.sentence).filter(s => s.length <= 500).join(" ") || excerpt?.trim().slice(0, 500) || headline;
  return { summary, methodology: content ? "Extractive summary: up to three source sentences prioritized for financial relevance." : "Publisher excerpt or headline; full article text unavailable.", fullTextAvailable: !!content?.trim() };
}
