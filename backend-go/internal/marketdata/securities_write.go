package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type SectorInput struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type CompanyInput struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Description  *string `json:"description"`
	SectorID     *string `json:"sectorId"`
	IndustryID   *string `json:"industryId"`
	Headquarters *string `json:"headquarters"`
	CEO          *string `json:"ceo"`
	Website      *string `json:"website"`
	Employees    *int64  `json:"employees"`
	Founded      *int    `json:"founded"`
}
type SecurityInput struct {
	ID        string  `json:"id"`
	Symbol    string  `json:"symbol"`
	Exchange  string  `json:"exchange"`
	CompanyID string  `json:"companyId"`
	Currency  string  `json:"currency"`
	Status    string  `json:"status"`
	ISIN      *string `json:"isin"`
	ListedAt  *string `json:"listedAt"`
}

var instrumentSymbol = regexp.MustCompile(`^[A-Z0-9.\-]{1,20}$`)
var instrumentISIN = regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)

// Includes delisted rows: additive discovery must not resurrect an existing
// instrument or overwrite its established company/profile with sparse metadata.
func (s *Store) RegisteredSecurity(ctx context.Context, exchange, symbol string) (*SecurityInput, error) {
	if exchange != "NSE" || !instrumentSymbol.MatchString(symbol) {
		return nil, errors.New("invalid registered security lookup")
	}
	rows, err := s.JSONRowsBounded(ctx, 8192, `SELECT row_to_json(result) FROM (SELECT id,symbol,exchange,company_id AS "companyId",currency,status,isin,to_char(listed_at,'YYYY-MM-DD') AS "listedAt" FROM market.securities WHERE exchange=$1 AND symbol=$2) result`, exchange, symbol)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	var result SecurityInput
	if json.Unmarshal(rows[0], &result) != nil {
		return nil, errors.New("invalid registered security record")
	}
	return &result, nil
}

func (s *Store) UpsertSector(ctx context.Context, v SectorInput) error {
	if v.ID == "" || len(v.ID) > 100 || v.Name == "" || len(v.Name) > 200 {
		return errors.New("invalid sector")
	}
	_, e := s.DB.ExecContext(ctx, `INSERT INTO market.sectors(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name WHERE sectors.name IS DISTINCT FROM EXCLUDED.name`, v.ID, v.Name)
	return e
}
func (s *Store) SectorByName(ctx context.Context, name string) (*SectorInput, error) {
	rows, e := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,name FROM market.sectors WHERE name=$1) result`, name)
	if e != nil {
		return nil, e
	}
	if len(rows) == 0 {
		return nil, nil
	}
	var v SectorInput
	if e := json.Unmarshal(rows[0], &v); e != nil {
		return nil, e
	}
	return &v, nil
}

// Name uniqueness is resolved atomically rather than a check-then-insert race
// between exchange adapters using different IDs for the same shared taxonomy.
func (s *Store) ResolveSector(ctx context.Context, v SectorInput) (SectorInput, error) {
	if v.ID == "" || len(v.ID) > 100 || v.Name == "" || len(v.Name) > 200 {
		return SectorInput{}, errors.New("invalid sector")
	}
	var canonical SectorInput
	e := s.DB.QueryRowContext(ctx, `INSERT INTO market.sectors(id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=sectors.name RETURNING id,name`, v.ID, v.Name).Scan(&canonical.ID, &canonical.Name)
	return canonical, e
}
func (s *Store) UpsertCompany(ctx context.Context, v CompanyInput) error {
	if !strings.HasPrefix(v.ID, "NSE:company:") || len(v.ID) > 80 || v.Name == "" || len(v.Name) > 400 {
		return errors.New("invalid company identity")
	}
	for _, value := range []*string{v.Description, v.Headquarters, v.CEO, v.Website, v.SectorID, v.IndustryID} {
		if value != nil && len(*value) > 12000 {
			return errors.New("company metadata budget")
		}
	}
	if v.Employees != nil && *v.Employees < 0 {
		return errors.New("invalid employee count")
	}
	if v.Founded != nil && (*v.Founded < 1 || *v.Founded > 9999) {
		return errors.New("invalid founding year")
	}
	if v.Website != nil && *v.Website != "" {
		u, e := url.Parse(*v.Website)
		if e != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
			return errors.New("invalid company website")
		}
	}
	_, e := s.DB.ExecContext(ctx, `INSERT INTO market.companies(id,name,description,sector_id,industry_id,headquarters,ceo,employees,founded,website) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sector_id=EXCLUDED.sector_id,industry_id=EXCLUDED.industry_id,headquarters=EXCLUDED.headquarters,ceo=EXCLUDED.ceo,employees=EXCLUDED.employees,founded=EXCLUDED.founded,website=EXCLUDED.website,updated_at=now() WHERE (companies.name,companies.description,companies.sector_id,companies.industry_id,companies.headquarters,companies.ceo,companies.employees,companies.founded,companies.website) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description,EXCLUDED.sector_id,EXCLUDED.industry_id,EXCLUDED.headquarters,EXCLUDED.ceo,EXCLUDED.employees,EXCLUDED.founded,EXCLUDED.website)`, v.ID, v.Name, v.Description, v.SectorID, v.IndustryID, v.Headquarters, v.CEO, v.Employees, v.Founded, v.Website)
	return e
}
func (s *Store) UpsertSecurity(ctx context.Context, v SecurityInput) error {
	if v.Exchange != "NSE" || v.Currency != "KES" || !instrumentSymbol.MatchString(v.Symbol) || v.ID != "NSE:"+v.Symbol || v.CompanyID != "NSE:company:"+v.Symbol || !map[string]bool{"active": true, "suspended": true, "halted": true, "delisted": true}[v.Status] {
		return errors.New("invalid security identity")
	}
	if v.ISIN != nil && !instrumentISIN.MatchString(*v.ISIN) {
		return errors.New("invalid security ISIN")
	}
	if v.ListedAt != nil {
		_, e := time.Parse("2006-01-02", *v.ListedAt)
		if e != nil {
			if _, e = time.Parse(time.RFC3339Nano, *v.ListedAt); e != nil {
				return errors.New("invalid listing date")
			}
		}
	}
	_, e := s.DB.ExecContext(ctx, `INSERT INTO market.securities(id,symbol,exchange,company_id,currency,status,isin,listed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET symbol=EXCLUDED.symbol,status=EXCLUDED.status,isin=EXCLUDED.isin,updated_at=now() WHERE securities.exchange=EXCLUDED.exchange AND securities.currency=EXCLUDED.currency AND securities.company_id=EXCLUDED.company_id AND (securities.symbol,securities.status,securities.isin) IS DISTINCT FROM (EXCLUDED.symbol,EXCLUDED.status,EXCLUDED.isin)`, v.ID, v.Symbol, v.Exchange, v.CompanyID, v.Currency, v.Status, v.ISIN, v.ListedAt)
	return e
}
