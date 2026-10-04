import { query, withTransaction } from "../db.js";
import type { NewsItem } from "../../types/market.js";
import { cleanArticleContent, dedupeNewsItems, isFinancialNews } from "../../domain/newsQuality.js";

interface NewsItemRow {
  id: string;
  headline: string;
  excerpt: string | null;
  content?: string | null;
  articleUrl: string;
  source: string;
  sourceName: string;
  category: string;
  imageUrl: string | null;
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  extractionConfidence: string | null;
  needsReview: boolean;
  publishedAt: string | null;
  securityIds: string[] | null;
  symbols: string[] | null;
}

function mapRow(row: NewsItemRow): NewsItem {
  return {
    id: row.id,
    headline: row.headline,
    excerpt: row.excerpt,
    content: cleanArticleContent(row.headline, row.content),
    articleUrl: row.articleUrl,
    source: row.source,
    sourceName: row.sourceName,
    category: row.category as NewsItem["category"],
    imageUrl: row.imageUrl,
    securityIds: row.securityIds ?? [],
    symbols: row.symbols ?? [],
    scrapedArtifactId: row.scrapedArtifactId,
    scrapedExtractionId: row.scrapedExtractionId,
    extractionConfidence: row.extractionConfidence !== null ? Number(row.extractionConfidence) : null,
    needsReview: row.needsReview,
    publishedAt: row.publishedAt,
  };
}

// symbols is a second aggregate off the same join, not a stored column —
// the frontend needs tickers ("SCOM"), not internal security UUIDs, to
// render mention chips and to group followed-symbol news (see
// useFollowedNews.ts), so this resolves it at read time rather than
// storing it denormalized and risking it drifting from securities.symbol.
const SELECT_WITH_SECURITIES = `
  SELECT n.id::text, n.headline, n.excerpt, n.article_url as "articleUrl", n.source, n.source_name as "sourceName",
         n.category, n.image_url as "imageUrl", n.scraped_artifact_id as "scrapedArtifactId", n.scraped_extraction_id as "scrapedExtractionId",
         n.extraction_confidence as "extractionConfidence", n.needs_review as "needsReview", n.published_at as "publishedAt",
         COALESCE(array_agg(DISTINCT nis.security_id) FILTER (WHERE nis.security_id IS NOT NULL), '{}') as "securityIds",
         COALESCE(array_agg(DISTINCT sec.symbol) FILTER (WHERE sec.symbol IS NOT NULL), '{}') as "symbols"
  FROM market.news_items n
  LEFT JOIN market.news_item_securities nis ON nis.news_item_id = n.id
  LEFT JOIN market.securities sec ON sec.id = nis.security_id
`;

// Production feeds must never surface development fixtures or generic tech
// aggregators. Keep this read-side guard even after the cleanup migration so
// a mistakenly re-enabled source cannot leak into TradersHub.
const TRUSTED_NEWS_FILTER = `
  lower(n.source) NOT LIKE '%hacker%'
  AND lower(n.source_name) NOT LIKE '%hacker news%'
  AND lower(n.article_url) NOT LIKE '%news.ycombinator.com%'
  AND lower(n.article_url) NOT LIKE '%hnrss.org%'
  AND lower(n.source) NOT IN ('test-rss', 'real-rss')
  AND lower(coalesce(n.headline, '') || ' ' || coalesce(n.excerpt, '')) !~
    '(road accident|car crash|bus crash|crash leaves|pilgrims? dead|murder|football|celebrity|entertainment|church service|obituary)'
`;

export const newsRepository = {
  /**
   * Upsert keyed on scraped_extraction_id — same idempotency pattern as
   * companyAnnouncementsRepository. Security mentions are replaced
   * wholesale on re-run (delete + re-insert) rather than diffed, since a
   * re-run only happens when the bridge reprocesses an extraction (e.g.
   * after a securities-directory change), and the set is small.
   */
  async upsert(input: {
    headline: string;
    excerpt: string | null;
    articleUrl: string;
    source: string;
    sourceName: string;
    category: NewsItem["category"];
    imageUrl: string | null;
    securityIds: string[];
    scrapedArtifactId: number | null;
    scrapedExtractionId: number;
    extractionConfidence: number | null;
    needsReview: boolean;
    publishedAt: string | null;
  }): Promise<void> {
    await withTransaction(async (client) => {
      // Serialize same-URL receipts even before the optional unique-index
      // migration is installed. Repeated crawls must not fail that index.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended(lower(regexp_replace(split_part($1, '?', 1), '/$', '')), 0))`, [input.articleUrl]);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM market.news_items WHERE scraped_extraction_id = $1
         OR lower(regexp_replace(split_part(article_url, '?', 1), '/$', '')) =
            lower(regexp_replace(split_part($2, '?', 1), '/$', ''))
         ORDER BY created_at ASC LIMIT 1`, [input.scrapedExtractionId, input.articleUrl],
      );
      if (existing.rows[0]) {
        const id = existing.rows[0].id;
        await client.query(
          `UPDATE market.news_items SET headline=$2, excerpt=$3, category=$4, image_url=$5,
           scraped_artifact_id=$6, scraped_extraction_id=$7, extraction_confidence=$8,
           needs_review=$9, updated_at=now() WHERE id=$1`,
          [id, input.headline, input.excerpt, input.category, input.imageUrl, input.scrapedArtifactId,
           input.scrapedExtractionId, input.extractionConfidence, input.needsReview],
        );
        await client.query(`DELETE FROM market.news_item_securities WHERE news_item_id=$1`, [id]);
        for (const securityId of input.securityIds) await client.query(
          `INSERT INTO market.news_item_securities (news_item_id, security_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, securityId],
        );
        return;
      }
      const res = await client.query<{ id: string }>(
        `INSERT INTO market.news_items
           (headline, excerpt, article_url, source, source_name, category, image_url,
            scraped_artifact_id, scraped_extraction_id, extraction_confidence, needs_review, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (scraped_extraction_id) DO UPDATE SET
           headline = EXCLUDED.headline,
           excerpt = EXCLUDED.excerpt,
           category = EXCLUDED.category,
           image_url = EXCLUDED.image_url,
           needs_review = EXCLUDED.needs_review,
           extraction_confidence = EXCLUDED.extraction_confidence,
           updated_at = now()
         RETURNING id`,
        [
          input.headline,
          input.excerpt,
          input.articleUrl,
          input.source,
          input.sourceName,
          input.category,
          input.imageUrl,
          input.scrapedArtifactId,
          input.scrapedExtractionId,
          input.extractionConfidence,
          input.needsReview,
          input.publishedAt,
        ],
      );
      const newsItemId = res.rows[0]!.id;

      await client.query(`DELETE FROM market.news_item_securities WHERE news_item_id = $1`, [newsItemId]);
      for (const securityId of input.securityIds) {
        await client.query(
          `INSERT INTO market.news_item_securities (news_item_id, security_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [newsItemId, securityId],
        );
      }
    });
  },

  async listRecent(limit = 50, category?: NewsItem["category"]): Promise<NewsItem[]> {
    const candidateLimit = Math.min(Math.max(limit * 4, 80), 400);
    const res = category
      ? await query<NewsItemRow>(
          `${SELECT_WITH_SECURITIES} WHERE ${TRUSTED_NEWS_FILTER} AND n.category = $2 GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $1`,
          [candidateLimit, category],
        )
      : await query<NewsItemRow>(
          `${SELECT_WITH_SECURITIES} WHERE ${TRUSTED_NEWS_FILTER} GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $1`,
          [candidateLimit],
        );
    return dedupeNewsItems(res.rows.map(mapRow).filter((item) => isFinancialNews(item.headline, item.excerpt ?? "", item.securityIds.length > 0))).slice(0, limit);
  },

  async listBySecurity(securityId: string, limit = 50): Promise<NewsItem[]> {
    const candidateLimit = Math.min(Math.max(limit * 4, 80), 400);
    const res = await query<NewsItemRow>(
      `${SELECT_WITH_SECURITIES} WHERE ${TRUSTED_NEWS_FILTER} AND n.id IN (SELECT news_item_id FROM market.news_item_securities WHERE security_id = $1)
       GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $2`,
      [securityId, candidateLimit],
    );
    return dedupeNewsItems(res.rows.map(mapRow).filter((item) => isFinancialNews(item.headline, item.excerpt ?? "", item.securityIds.length > 0))).slice(0, limit);
  },

  async getById(id: string): Promise<NewsItem | null> {
    const res = await query<NewsItemRow>(
      `${SELECT_WITH_SECURITIES.replace("n.excerpt,", "n.excerpt, e.text as content,")}
       LEFT JOIN scraping.extractions e ON e.id = n.scraped_extraction_id
       WHERE ${TRUSTED_NEWS_FILTER} AND n.id = $1 GROUP BY n.id, e.text LIMIT 1`,
      [id],
    );
    const item = res.rows[0] ? mapRow(res.rows[0]) : null;
    return item && isFinancialNews(item.headline, item.excerpt ?? "", item.securityIds.length > 0) ? item : null;
  },

  async existsForExtraction(scrapedExtractionId: number): Promise<boolean> {
    const res = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM market.news_items WHERE scraped_extraction_id = $1) as exists`,
      [scrapedExtractionId],
    );
    return res.rows[0]?.exists ?? false;
  },
};
