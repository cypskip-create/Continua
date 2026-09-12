import { query, withTransaction } from "../db.js";
import type { NewsItem } from "../../types/market.js";

interface NewsItemRow {
  id: string;
  headline: string;
  excerpt: string | null;
  articleUrl: string;
  source: string;
  sourceName: string;
  category: string;
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  extractionConfidence: string | null;
  needsReview: boolean;
  publishedAt: string | null;
  securityIds: string[] | null;
}

function mapRow(row: NewsItemRow): NewsItem {
  return {
    id: row.id,
    headline: row.headline,
    excerpt: row.excerpt,
    articleUrl: row.articleUrl,
    source: row.source,
    sourceName: row.sourceName,
    category: row.category as NewsItem["category"],
    securityIds: row.securityIds ?? [],
    scrapedArtifactId: row.scrapedArtifactId,
    scrapedExtractionId: row.scrapedExtractionId,
    extractionConfidence: row.extractionConfidence !== null ? Number(row.extractionConfidence) : null,
    needsReview: row.needsReview,
    publishedAt: row.publishedAt,
  };
}

const SELECT_WITH_SECURITIES = `
  SELECT n.id::text, n.headline, n.excerpt, n.article_url as "articleUrl", n.source, n.source_name as "sourceName",
         n.category, n.scraped_artifact_id as "scrapedArtifactId", n.scraped_extraction_id as "scrapedExtractionId",
         n.extraction_confidence as "extractionConfidence", n.needs_review as "needsReview", n.published_at as "publishedAt",
         COALESCE(array_agg(nis.security_id) FILTER (WHERE nis.security_id IS NOT NULL), '{}') as "securityIds"
  FROM market.news_items n
  LEFT JOIN market.news_item_securities nis ON nis.news_item_id = n.id
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
    securityIds: string[];
    scrapedArtifactId: number | null;
    scrapedExtractionId: number;
    extractionConfidence: number | null;
    needsReview: boolean;
    publishedAt: string | null;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const res = await client.query<{ id: string }>(
        `INSERT INTO market.news_items
           (headline, excerpt, article_url, source, source_name, category,
            scraped_artifact_id, scraped_extraction_id, extraction_confidence, needs_review, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (scraped_extraction_id) DO UPDATE SET
           headline = EXCLUDED.headline,
           excerpt = EXCLUDED.excerpt,
           category = EXCLUDED.category,
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
    const res = category
      ? await query<NewsItemRow>(
          `${SELECT_WITH_SECURITIES} WHERE n.category = $2 GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $1`,
          [limit, category],
        )
      : await query<NewsItemRow>(
          `${SELECT_WITH_SECURITIES} GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $1`,
          [limit],
        );
    return res.rows.map(mapRow);
  },

  async listBySecurity(securityId: string, limit = 50): Promise<NewsItem[]> {
    const res = await query<NewsItemRow>(
      `${SELECT_WITH_SECURITIES} WHERE n.id IN (SELECT news_item_id FROM market.news_item_securities WHERE security_id = $1)
       GROUP BY n.id ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC LIMIT $2`,
      [securityId, limit],
    );
    return res.rows.map(mapRow);
  },

  async existsForExtraction(scrapedExtractionId: number): Promise<boolean> {
    const res = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM market.news_items WHERE scraped_extraction_id = $1) as exists`,
      [scrapedExtractionId],
    );
    return res.rows[0]?.exists ?? false;
  },
};