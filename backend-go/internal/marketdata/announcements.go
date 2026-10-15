package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
)

const announcementColumns = `id::text,company_id AS "companyId",security_id AS "securityId",raw_company_name AS "rawCompanyName",
 title,document_url AS "documentUrl",source,exchange,scraped_artifact_id AS "scrapedArtifactId",scraped_extraction_id AS "scrapedExtractionId",
 extraction_confidence::float8 AS "extractionConfidence",needs_review AS "needsReview",excerpt,
 to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"`

func (s *Store) Announcements(ctx context.Context, id string, limit int) ([]json.RawMessage, error) {
	if id == "" || limit < 1 || limit > 100 {
		return nil, errors.New("invalid announcement query")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+announcementColumns+` FROM market.company_announcements WHERE security_id=$1 ORDER BY created_at DESC LIMIT $2) result`, id, limit)
}
func (s *Store) UnresolvedAnnouncements(ctx context.Context, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 500 {
		return nil, errors.New("invalid announcement review batch")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+announcementColumns+` FROM market.company_announcements WHERE company_id IS NULL ORDER BY created_at DESC LIMIT $1) result`, limit)
}

type Announcement struct {
	CompanyID      *string  `json:"companyId"`
	SecurityID     *string  `json:"securityId"`
	RawCompanyName *string  `json:"rawCompanyName"`
	Title          string   `json:"title"`
	DocumentURL    string   `json:"documentUrl"`
	Source         string   `json:"source"`
	Exchange       string   `json:"exchange"`
	ArtifactID     int64    `json:"scrapedArtifactId"`
	ExtractionID   int64    `json:"scrapedExtractionId"`
	Confidence     *float64 `json:"extractionConfidence"`
	NeedsReview    bool     `json:"needsReview"`
	Excerpt        *string  `json:"excerpt"`
	PublishedAt    *string  `json:"publishedAt"`
}

func (s *Store) UpsertAnnouncement(ctx context.Context, input Announcement) error {
	if input.Exchange != "NSE" || input.ExtractionID < 1 || input.ArtifactID < 1 || input.DocumentURL == "" {
		return errors.New("invalid announcement evidence")
	}
	u, err := url.Parse(input.DocumentURL)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("invalid announcement source URL")
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO market.company_announcements(company_id,security_id,raw_company_name,title,document_url,source,exchange,
 scraped_artifact_id,scraped_extraction_id,extraction_confidence,needs_review,excerpt,published_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ON CONFLICT(scraped_extraction_id) DO UPDATE SET company_id=EXCLUDED.company_id,security_id=EXCLUDED.security_id,
 needs_review=EXCLUDED.needs_review,extraction_confidence=EXCLUDED.extraction_confidence,updated_at=now()`,
		input.CompanyID, input.SecurityID, input.RawCompanyName, input.Title, input.DocumentURL, input.Source, input.Exchange, input.ArtifactID, input.ExtractionID, input.Confidence, input.NeedsReview, input.Excerpt, input.PublishedAt)
	return err
}
func (s *Store) AnnouncementExistsForExtraction(ctx context.Context, id int64) (bool, error) {
	if id < 1 {
		return false, errors.New("invalid announcement extraction")
	}
	var exists bool
	err := s.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM market.company_announcements WHERE scraped_extraction_id=$1)`, id).Scan(&exists)
	return exists, err
}

func (s *Store) Movers(ctx context.Context, exchange string, limit int) (json.RawMessage, error) {
	if exchange != "NSE" || limit < 1 || limit > 50 {
		return nil, errors.New("invalid movers query")
	}
	// Sequential small LIMIT reads stay within the native four-connection pool.
	gainers, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+quoteColumns+` FROM market.live_quotes q WHERE q.exchange=$1 AND q.status='active' ORDER BY q.change_percent DESC LIMIT $2) result`, exchange, limit)
	if err != nil {
		return nil, err
	}
	losers, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+quoteColumns+` FROM market.live_quotes q WHERE q.exchange=$1 AND q.status='active' ORDER BY q.change_percent ASC LIMIT $2) result`, exchange, limit)
	if err != nil {
		return nil, err
	}
	if gainers == nil {
		gainers = []json.RawMessage{}
	}
	if losers == nil {
		losers = []json.RawMessage{}
	}
	return json.Marshal(map[string]any{"gainers": gainers, "losers": losers})
}
