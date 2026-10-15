package marketdata

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

func TestPublishedQuotesRequireSourceRightsApprovedSchemaAndPrivateEvidence(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*src.redistribution_allowed=true.*quoteMappingApproved.*r2://continua-financial-documents/.*current.security_id IS NULL.*LIMIT 501`).WillReturnRows(sqlmock.NewRows([]string{"row"}))
	rows, e := s.RefreshPublishedQuotes(context.Background(), time.Now())
	if e != nil || len(rows) != 0 {
		t.Fatal(rows, e)
	}
}
func TestFutureSourceQuotesAreNotPublished(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*quoteMappingApproved`).WillReturnRows(sqlmock.NewRows([]string{"row"}).AddRow([]byte(`{"securityId":"NSE:KCB","symbol":"KCB","exchange":"NSE","currency":"KES","status":"suspended","observation":{"kind":"market_quote_candidate","symbol":"KCB","currency":"KES","timestamp":"2027-01-01T12:00:00.000Z","lastPrice":30,"open":29,"high":31,"low":28,"previousClose":29,"volume":0,"change":1,"changePercent":3.45}}`)))
	rows, e := s.RefreshPublishedQuotes(context.Background(), time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC))
	if e != nil || len(rows) != 0 {
		t.Fatal(rows, e)
	}
}
