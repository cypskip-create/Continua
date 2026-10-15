package marketdata

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"
)

type NewsInput struct {
	Headline     string   `json:"headline"`
	Excerpt      string   `json:"excerpt"`
	ArticleURL   string   `json:"articleUrl"`
	Source       string   `json:"source"`
	SourceName   string   `json:"sourceName"`
	Category     string   `json:"category"`
	ImageURL     *string  `json:"imageUrl"`
	SecurityIDs  []string `json:"securityIds"`
	ArtifactID   int64    `json:"scrapedArtifactId"`
	ExtractionID int64    `json:"scrapedExtractionId"`
	Confidence   *float64 `json:"extractionConfidence"`
	NeedsReview  bool     `json:"needsReview"`
	PublishedAt  *string  `json:"publishedAt"`
}

func (s *Store) UpsertNews(ctx context.Context, input NewsInput) error {
	u, err := url.Parse(input.ArticleURL)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || strings.TrimSpace(input.Headline) == "" || input.ExtractionID < 1 || input.ArtifactID < 1 || len(input.SecurityIDs) > 1000 {
		return errors.New("invalid news evidence")
	}
	if !map[string]bool{"markets": true, "earnings": true, "economy": true, "companies": true}[input.Category] {
		return errors.New("invalid news category")
	}
	if input.Confidence != nil && (math.IsNaN(*input.Confidence) || math.IsInf(*input.Confidence, 0)) {
		return errors.New("invalid news confidence")
	}
	if input.PublishedAt != nil {
		if _, err := time.Parse(time.RFC3339Nano, *input.PublishedAt); err != nil {
			return errors.New("invalid news publication date")
		}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(lower(regexp_replace(split_part($1, '?', 1), '/$', '')),0))`, input.ArticleURL)
	if err != nil {
		return err
	}
	// Serialize repeated receipts from one immutable extraction as well as URLs.
	// Different URLs with the same extraction must not race association updates.
	_, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('news-extraction:' || $1::text,0))`, input.ExtractionID)
	if err != nil {
		return err
	}
	var id int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM market.news_items WHERE scraped_extraction_id=$1
 OR lower(regexp_replace(split_part(article_url,'?',1),'/$',''))=lower(regexp_replace(split_part($2,'?',1),'/$',''))
 ORDER BY created_at ASC,id ASC LIMIT 1 FOR UPDATE`, input.ExtractionID, input.ArticleURL).Scan(&id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE market.news_items SET headline=$2,excerpt=$3,category=$4,image_url=$5,
 scraped_artifact_id=$6,scraped_extraction_id=$7,extraction_confidence=$8,needs_review=$9,
 published_at=COALESCE($10,published_at),updated_at=now() WHERE id=$1`, id, input.Headline, input.Excerpt, input.Category, input.ImageURL, input.ArtifactID, input.ExtractionID, input.Confidence, input.NeedsReview, input.PublishedAt)
	} else {
		err = tx.QueryRowContext(ctx, `INSERT INTO market.news_items(headline,excerpt,article_url,source,source_name,category,image_url,
 scraped_artifact_id,scraped_extraction_id,extraction_confidence,needs_review,published_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
 ON CONFLICT(scraped_extraction_id) DO UPDATE SET headline=EXCLUDED.headline,excerpt=EXCLUDED.excerpt,category=EXCLUDED.category,
 image_url=EXCLUDED.image_url,needs_review=EXCLUDED.needs_review,extraction_confidence=EXCLUDED.extraction_confidence,updated_at=now() RETURNING id`,
			input.Headline, input.Excerpt, input.ArticleURL, input.Source, input.SourceName, input.Category, input.ImageURL, input.ArtifactID, input.ExtractionID, input.Confidence, input.NeedsReview, input.PublishedAt).Scan(&id)
	}
	if err != nil {
		return err
	}
	if err = replaceNewsLinks(ctx, tx, id, input.SecurityIDs); err != nil {
		return err
	}
	return tx.Commit()
}
func replaceNewsLinks(ctx context.Context, tx *sql.Tx, id int64, securityIDs []string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM market.news_item_securities WHERE news_item_id=$1`, id); err != nil {
		return err
	}
	ordered := append([]string(nil), securityIDs...)
	sort.Strings(ordered)
	for i, security := range ordered {
		if security == "" {
			return errors.New("empty news issuer")
		}
		if i > 0 && ordered[i-1] == security {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO market.news_item_securities(news_item_id,security_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, id, security); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) NewsExistsForExtraction(ctx context.Context, id int64) (bool, error) {
	if id < 1 {
		return false, errors.New("invalid extraction id")
	}
	var exists bool
	err := s.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM market.news_items WHERE scraped_extraction_id=$1)`, id).Scan(&exists)
	return exists, err
}
