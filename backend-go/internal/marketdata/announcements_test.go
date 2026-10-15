package marketdata

import (
	"context"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestAnnouncementReadersPreserveUnknownDatesAndReviewFlags(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*extraction_confidence::float8.*WHERE security_id=\$1 ORDER BY created_at DESC`).WithArgs("NSE:KCB", 50).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"title":"Literal filing","publishedAt":null,"needsReview":true}`)))
	rows, err := s.Announcements(context.Background(), "NSE:KCB", 50)
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
}
func TestMoversReadIndexedLimitsWithoutInventingMissingValues(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*q.status='active'.*ORDER BY q.change_percent DESC LIMIT \$2`).WithArgs("NSE", 10).WillReturnRows(sqlmock.NewRows([]string{"result"}))
	m.ExpectQuery(`SELECT row_to_json.*q.status='active'.*ORDER BY q.change_percent ASC LIMIT \$2`).WithArgs("NSE", 10).WillReturnRows(sqlmock.NewRows([]string{"result"}))
	raw, err := s.Movers(context.Background(), "NSE", 10)
	if err != nil || string(raw) != `{"gainers":[],"losers":[]}` {
		t.Fatal(string(raw), err)
	}
}
